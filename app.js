// Home page: links from config.js and the token gate panel.
(() => {
  const C = window.AXON_CONFIG || {};
  const G = window.AxonGate;
  const $ = (id) => document.getElementById(id);

  for (const id of ["xLink", "xLink2"]) $(id).href = C.xUrl || "#";
  $("tgLink").href = C.communityUrl || "#";


  const msg = (t, kind = "") => { $("gMsg").textContent = t; $("gMsg").className = `msg ${kind}`; };
  let cfg = null;

  function show(user) {
    const open = !!user;
    $("gateState").textContent = open ? "UNLOCKED" : "LOCKED";
    $("gateState").style.color = open ? "var(--ok)" : "var(--orange)";
    $("gWallet").textContent = user ? G.short(user.address) : "not connected";
    if (user && !cfg?.demo) $("gBalance").textContent = `${G.fmt(user.balance)} $${cfg.tokenSymbol}`;
    $("connectBtn").style.display = open ? "none" : "";
    $("studioBtn").style.display = open ? "" : "none";
    $("outBtn").style.display = open ? "" : "none";
  }

  const PERKS = [
    ["Full studio: chat, editor, live preview", "Templates and unlimited projects", "Download every app you build"],
    ["Everything in Signal", "More builds every day", "Best for shipping side projects"],
    ["Everything in Synapse", "The most builds a day", "First access to new features"],
  ];
  function drawTiers(c) {
    const box = document.getElementById("tierCards");
    if (!box || !Array.isArray(c.tiers)) return;
    box.innerHTML = c.tiers.map((t, i) => `
      <div class="tier ${i === 1 ? "hot" : ""}">
        <div class="tier-n mono">${t.name.toUpperCase()}</div>
        <div class="tier-h">${t.dailyBuilds > 0 ? t.dailyBuilds + " builds" : "Unlimited"}<span class="tier-sub"> / day</span></div>
        <div class="tier-sub">hold ${c.demo && !c.tokenAddress ? "" : "≥ "}${G.fmt(t.minBalance)} $${c.tokenSymbol}</div>
        <ul>${(PERKS[i] || PERKS[2]).map((p) => `<li>${p}</li>`).join("")}</ul>
      </div>`).join("");
  }

  G.config().then((c) => {
    cfg = c;
    drawTiers(c);
    $("gNeed").textContent = c.demo ? "open (demo mode)" : `${G.fmt(c.requiredAmount)} $${c.tokenSymbol}`;
    const buy = c.buyUrl || C.buyUrl;
    if (buy) { $("buyBtn").href = buy; $("buyBtn").style.display = ""; }
    if (c.tokenAddress) {
      $("gCa").innerHTML = `<a href="${c.explorerUrl}/token/${c.tokenAddress}" target="_blank" rel="noreferrer" title="${c.tokenAddress}">${G.short(c.tokenAddress)} ↗</a>`;
    } else $("gCa").textContent = "coming soon";
    if (!c.ready) msg("Sign-in isn't set up on the server yet (SESSION_SECRET).", "err");
    if (c.tokenAddress) {
      const ca = document.createElement("button");
      ca.className = "ca"; ca.textContent = `CA ${c.tokenAddress}`;
      ca.onclick = () => { navigator.clipboard?.writeText(c.tokenAddress); ca.textContent = "Copied ✓"; setTimeout(() => (ca.textContent = `CA ${c.tokenAddress}`), 1200); };
      $("footCa").appendChild(ca);
    }
    return G.me();
  }).then(show).catch((e) => msg(e.message, "err"));

  $("connectBtn").onclick = async () => {
    msg("Check your wallet to sign the message…");
    $("connectBtn").disabled = true;
    try {
      const u = await G.connect();
      show(u);
      msg(cfg?.demo ? "Signed in (demo mode). The studio is open." : "Access granted. Welcome to the studio.", "ok");
    } catch (e) {
      if (e.info?.balance != null) $("gBalance").textContent = `${G.fmt(e.info.balance)} $${cfg?.tokenSymbol ?? ""}`;
      msg(/reject|denied|cancel/i.test(e.message) ? "Cancelled in your wallet." : e.message, "err");
    } finally { $("connectBtn").disabled = false; }
  };
  $("outBtn").onclick = async () => { await G.logout(); show(null); msg("Disconnected."); };
})();
