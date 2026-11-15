// Studio: projects (saved in this browser), chat with Axon, code editor and live preview.
(() => {
  const G = window.AxonGate;
  const $ = (s) => document.querySelector(s);
  const KEY = "axon_projects_v1";
  const STARTER = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif;
         background: radial-gradient(circle at 50% 30%, #2a1a5e, #05040a); color: #fff; text-align: center; }
  h1 { font-size: 42px; margin: 0 0 8px; color: #7cf7ff; } p { opacity: .8; }
</style>
</head>
<body>
  <div><h1>Axon is online ✦</h1><p>Tell me what to build in the chat on the left.</p></div>
</body>
</html>`;

  // ---------- gate ----------
  G.me().then((u) => {
    if (!u) return;
    $("#locked").style.display = "none";
    $("#who").textContent = `${G.short(u.address)}${u.tier ? " · " + u.tier.toUpperCase() : ""}`;
    showCredits(u.used, u.limit);
  }).catch(() => {});
  function showCredits(used, limit) { $("#credits").textContent = limit > 0 ? `${used}/${limit} TODAY` : ""; }
  $("#outBtn").onclick = async () => { await G.logout(); location.href = "index.html"; };

  // ---------- mobile tabs ----------
  document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".st-col").forEach((c) => c.classList.toggle("on", c.id === b.dataset.col));
    if (b.dataset.col === "prevCol") render();
  }));

  // ---------- projects ----------
  let projects = [];
  try { projects = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
  if (!projects.length) projects = [{ id: Date.now(), name: "Project 1", code: STARTER, chat: [], versions: [] }];
  let cur = projects[projects.length - 1];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(projects)); } catch { $("#saved").textContent = "storage full"; } };

  const sel = $("#projectSel");
  function drawSelect() {
    sel.innerHTML = "";
    projects.forEach((p) => { const o = new Option(p.name, p.id); o.selected = p === cur; sel.add(o); });
  }
  sel.onchange = () => { if (busy) return; cur = projects.find((p) => p.id == sel.value); load(); };
  $("#newBtn").onclick = () => {
    if (busy) return;
    cur = { id: Date.now(), name: `Project ${projects.length + 1}`, code: STARTER, chat: [], versions: [] };
    projects.push(cur); persist(); drawSelect(); load();
  };

  // ---------- editor + preview ----------
  const code = $("#code"), frame = $("#frame"), saved = $("#saved");
  // The preview is sandboxed (no access to this page), so the browser blocks its localStorage.
  // This shim gives the app an in-memory one instead, so apps that save data still run.
  const SHIM = `<script>(function(){function mk(){var m={};return{getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n].getItem("_")}catch(e){try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch(_){}}})})();<\/script>`;
  const render = () => (frame.srcdoc = SHIM + code.value);
  let t;
  code.addEventListener("input", () => {
    saved.textContent = "editing…";
    clearTimeout(t);
    t = setTimeout(() => { cur.code = code.value; persist(); render(); saved.textContent = "saved"; }, 350);
  });
  code.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    code.setRangeText("  ", code.selectionStart, code.selectionEnd, "end");
    code.dispatchEvent(new Event("input"));
  });
  $("#reloadBtn").onclick = render;
  $("#exportBtn").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code.value], { type: "text/html" }));
    a.download = cur.name.replace(/\s+/g, "-").toLowerCase() + ".html";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#undoBtn").onclick = () => {
    if (busy || !cur.versions.length) return;
    cur.code = cur.versions.pop(); code.value = cur.code; persist(); render(); saved.textContent = "undone";
  };

  // ---------- chat ----------
  const chat = $("#chat");
  function bubble(who, text, flag) {
    const d = document.createElement("div");
    d.className = `bubble ${who === "me" ? "me" : ""} ${flag === "err" ? "err" : ""}`;
    d.textContent = text;
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
    return d;
  }
  function load() {
    code.value = cur.code; render(); chat.innerHTML = "";
    if (!cur.chat.length) bubble("axon", "Axon online. Describe what to build: a game, a dashboard, a landing page, a tool…");
    for (const [who, txt, flag] of cur.chat) bubble(who, txt, flag);
    drawSelect();
  }

  // ---------- agent ----------
  const ERR = "\n[[axon:error]] ";
  // Split streamed text into the short reply and the HTML block.
  function parse(text) {
    let err = null;
    const e = text.indexOf(ERR);
    if (e !== -1) { err = text.slice(e + ERR.length).trim(); text = text.slice(0, e); }
    const open = text.search(/```html\s*\n/i);
    if (open === -1) return { reply: text.trim(), html: null, err };
    const reply = text.slice(0, open).trim();
    let html = text.slice(open).replace(/^```html\s*\n/i, "");
    const close = html.lastIndexOf("```");
    const done = close !== -1;
    if (done) html = html.slice(0, close);
    return { reply, html: html.trimEnd(), done, err };
  }
  const history = () => cur.chat.slice(0, -1).filter(([, , f]) => f !== "err").slice(-10)
    .map(([who, txt]) => ({ role: who === "me" ? "user" : "assistant", text: String(txt).slice(0, 2000) }));

  let busy = false;
  $("#askForm").onsubmit = async (e) => {
    e.preventDefault();
    const prompt = $("#prompt").value.trim();
    if (!prompt || busy) return;
    busy = true; $("#sendBtn").disabled = true; $("#prompt").value = "";
    cur.chat.push(["me", prompt]); bubble("me", prompt);
    const live = bubble("axon", "Axon is thinking…"); live.classList.add("typing");
    const before = code.value;
    let text = "", lastPaint = 0;
    try {
      const r = await fetch("/api/agent", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, code: before === STARTER ? "" : before, history: history() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) $("#locked").style.display = "";
        throw new Error(d.error || `Error ${r.status}`);
      }
      const credits = r.headers.get("x-axon-credits");
      if (credits) { const [u, l] = credits.split("/").map(Number); showCredits(u, l); }
      const reader = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        const p = parse(text);
        live.classList.remove("typing");
        live.textContent = p.reply || "Writing code…";
        if (p.html && Date.now() - lastPaint > 120) { code.value = p.html; code.scrollTop = code.scrollHeight; lastPaint = Date.now(); }
      }
      const p = parse(text);
      if (p.err) throw new Error(p.err);
      if (p.html) {
        cur.versions.push(before); if (cur.versions.length > 30) cur.versions.shift();
        cur.code = p.html; code.value = p.html; render();
      }
      const reply = p.reply || (p.html ? "Done. Have a look at the preview." : "I couldn't produce an app for that. Try describing it differently.");
      live.textContent = reply; cur.chat.push(["axon", reply]);
    } catch (err) {
      code.value = cur.code;
      live.classList.remove("typing"); live.classList.add("err"); live.textContent = err.message;
      cur.chat.push(["axon", err.message, "err"]);
    } finally {
      persist(); busy = false; $("#sendBtn").disabled = false; chat.scrollTop = chat.scrollHeight;
    }
  };
  $("#prompt").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#askForm").requestSubmit(); } });

  // ---------- templates ----------
  const TEMPLATES = { snake: "Neon Snake", dashboard: "Pulse dashboard", habits: "Streaks tracker", landing: "$ORBIT landing page" };
  async function openTemplate(id) {
    if (!TEMPLATES[id] || busy) return;
    const r = await fetch(`templates/${id}.html`).catch(() => null);
    if (!r || !r.ok) return;
    const html = await r.text();
    cur = { id: Date.now(), name: TEMPLATES[id], code: html, chat: [["axon", `Loaded the ${TEMPLATES[id]} template. Tell me what to change: colors, features, text, anything.`]], versions: [] };
    projects.push(cur); persist(); load();
  }
  const tplSel = document.getElementById("tplSel");
  if (tplSel) tplSel.onchange = () => { openTemplate(tplSel.value); tplSel.value = ""; };
  const wanted = new URLSearchParams(location.search).get("template");

  load();
  if (wanted) { openTemplate(wanted); window.history.replaceState(null, "", location.pathname); }
})();
