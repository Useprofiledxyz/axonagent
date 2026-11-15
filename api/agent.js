import Anthropic from "@anthropic-ai/sdk";
import { json, readBody, refundCredit, session, useCredit } from "./_lib.js";

// POST /api/agent { prompt, code, history }: Axon writes or edits a single-file web app and
// streams back plain text: one short sentence, then the full app in a ```html block.
// Only signed-in token holders get here (session cookie), with a daily limit per wallet.

const MODEL = process.env.AXON_MODEL || "claude-opus-5-5";
const ERR = "\n[[axon:error]] ";

const SYSTEM = `You are Axon, the build agent inside Axon, a prompt-to-app studio in the browser.
You turn a person's description into a complete, working single-file web app.

How you answer, every time:
1. One or two short sentences saying what you built or changed. No headings, no lists.
2. Then the whole app as ONE fenced block that starts with \`\`\`html and ends with \`\`\`.

Rules for the app:
- A single self-contained HTML document: <!doctype html>, inline <style> and <script>. It runs in a sandboxed iframe with no server.
- Libraries only from https://cdn.jsdelivr.net or https://unpkg.com with exact versions, and only when they clearly help (charts, 3D, icons). Plain HTML/CSS/JS is preferred.
- No external images unless the person gave a URL; use CSS, SVG or emoji instead.
- Make it look finished: thoughtful layout, spacing, colors and states, responsive down to phone width.
- Use localStorage for data that should survive a reload.
- When you are given the current code, return the full updated file (not a diff) and keep everything the person did not ask to change.
- Never ask for or include API keys, wallet seed phrases or private keys.`;

let client;
const anthropic = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const s = session(req);
  if (!s) return json(res, 401, { error: "Connect a holder wallet on the home page first." });
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: "The agent isn't configured yet (ANTHROPIC_API_KEY missing)." });

  const body = await readBody(req);
  const prompt = String(body.prompt || "").trim().slice(0, 8000);
  const code = String(body.code || "").slice(0, 200_000);
  if (!prompt) return json(res, 400, { error: "Write what you want to build." });

  const credit = useCredit(s.address, s.balance || 0);
  if (!credit.ok) return json(res, 429, { error: `Daily limit reached (${credit.limit} builds). Come back tomorrow.` });

  // Earlier turns (text only) so follow-ups like "make it darker" have context.
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const messages = [];
  for (const h of history) {
    const role = h?.role === "assistant" ? "assistant" : "user";
    const text = String(h?.text || "").slice(0, 2000);
    if (!text) continue;
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n\n${text}`;
    else messages.push({ role, content: text });
  }
  if (messages.length && messages[0].role === "assistant") messages.shift();
  const ask = code ? `Current app:\n\`\`\`html\n${code}\n\`\`\`\n\nRequest: ${prompt}` : prompt;
  if (messages.length && messages[messages.length - 1].role === "user") messages.push({ role: "assistant", content: "Okay." });
  messages.push({ role: "user", content: ask });

  res.statusCode = 200;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-axon-credits", `${credit.used}/${credit.limit}`);

  const abort = new AbortController();
  // Stop generating if the browser goes away (the response closes before we finished it).
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });
  try {
    const stream = anthropic().beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      output_config: { effort: "medium" },
      // If the model declines, the API re-runs the request on a fallback model by itself.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages,
    }, { signal: abort.signal });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") res.write(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") res.write(`${ERR}Axon can't build that one. Try a different request.`);
    else if (final.stop_reason === "max_tokens") res.write(`${ERR}The app got too long and was cut off. Ask for a smaller version.`);
  } catch (e) {
    refundCredit(s.address); // failed on our side: this build doesn't count
    if (abort.signal.aborted) return res.end();
    let msg = "Axon hit an error. Try again.";
    if (e instanceof Anthropic.RateLimitError) msg = "Axon is busy right now. Try again in a minute.";
    else if (e instanceof Anthropic.AuthenticationError) msg = "The agent's API key is invalid.";
    else if (e instanceof Anthropic.APIConnectionError) msg = "Couldn't reach the AI service. Try again.";
    else if (e instanceof Anthropic.APIError) msg = `AI service error (${e.status ?? "?"}). Try again.`;
    console.error("agent error", e);
    res.write(ERR + msg);
  }
  res.end();
}
