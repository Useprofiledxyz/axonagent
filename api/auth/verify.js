import { SESSION_COOKIE, hasSecret, json, readBody, setCookie, settings, sign, tokenBalance, unsign, verifyWalletSignature } from "../_lib.js";

const SESSION_HOURS = 12;

// POST /api/auth/verify { ticket, signature }: checks the wallet signature, reads the token
// balance on chain, and opens a session cookie when the wallet holds enough.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  if (!hasSecret()) return json(res, 503, { error: "Sign-in isn't set up yet: add SESSION_SECRET in the hosting settings." });
  const { ticket, signature } = await readBody(req);
  const t = unsign(ticket);
  if (!t || t.kind !== "nonce") return json(res, 400, { error: "The sign-in request expired. Try again." });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature) || !(await verifyWalletSignature(t.address, t.message, signature))) {
    return json(res, 401, { error: "The signature didn't match this wallet." });
  }
  const s = settings();
  let balance = 0;
  if (!s.demo) {
    try { balance = await tokenBalance(t.address); }
    catch { return json(res, 502, { error: `Couldn't read your balance from ${s.chainName}. Try again in a moment.` }); }
    if (balance < s.requiredAmount) {
      return json(res, 403, { error: `You hold ${balance.toLocaleString("en-US")} $${s.tokenSymbol}. The studio needs ${s.requiredAmount.toLocaleString("en-US")}.`, balance, required: s.requiredAmount });
    }
  }
  setCookie(res, SESSION_COOKIE, sign({ kind: "session", address: t.address, balance, exp: Date.now() + SESSION_HOURS * 3600_000 }), SESSION_HOURS * 3600);
  json(res, 200, { address: t.address, balance, demo: s.demo });
}
