// Token gate (browser side), Robinhood Chain (EVM). The server does the real checks:
//   1. GET  /api/auth/nonce   -> a sign-in message for this wallet
//   2. the wallet signs it (personal_sign: free, no transaction, no gas)
//   3. POST /api/auth/verify  -> server checks the signature, reads the token balance on
//                                Robinhood Chain and sets an HttpOnly session cookie
// The studio and the agent check that cookie again on every request.
window.AxonGate = (() => {
  const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  const toHex = (s) => "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

  async function api(path, opts = {}) {
    let r;
    try {
      r = await fetch(path, { credentials: "same-origin", ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    } catch { throw new Error("Can't reach the Axon server. Check your connection."); }
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  }

  let cfgP;
  const config = () => (cfgP ??= api("/api/config").then(({ status, data }) => {
    if (status !== 200) throw new Error("Axon server is offline.");
    return data;
  }));

  function provider() {
    if (!window.ethereum) throw new Error("No wallet found. Install MetaMask or Rabby, or open this page in your wallet's browser.");
    return window.ethereum;
  }

  // Ask the wallet to switch to Robinhood Chain, adding it first when the wallet doesn't know it.
  async function ensureChain(eth, c) {
    const current = await eth.request({ method: "eth_chainId" });
    if (String(current).toLowerCase() === c.chainIdHex.toLowerCase()) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: c.chainIdHex }] });
    } catch (e) {
      if (e?.code !== 4902) throw e;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: c.chainIdHex, chainName: c.chainName, rpcUrls: [c.rpcUrl],
          blockExplorerUrls: c.explorerUrl ? [c.explorerUrl] : [],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        }],
      });
    }
  }

  async function connect() {
    const c = await config();
    const eth = provider();
    const [address] = await eth.request({ method: "eth_requestAccounts" });
    if (!address) throw new Error("The wallet didn't share an address.");
    // Nice to have, not required: the signature works on any network and the server reads the
    // balance from Robinhood Chain itself, so a declined or failed switch doesn't stop sign-in.
    if (!c.demo) { try { await ensureChain(eth, c); } catch (e) { console.warn("network switch skipped:", e?.message || e); } }
    const n = await api(`/api/auth/nonce?address=${encodeURIComponent(address)}`);
    if (n.status !== 200) throw new Error(n.data.error || "Couldn't start sign-in.");
    const signature = await eth.request({ method: "personal_sign", params: [toHex(n.data.message), address] });
    const v = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ ticket: n.data.ticket, signature }) });
    if (v.status !== 200) throw Object.assign(new Error(v.data.error || "Access denied."), { info: v.data });
    return v.data;
  }

  async function me() {
    const r = await api("/api/auth/me");
    return r.status === 200 ? r.data : null;
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
  }

  return { config, connect, me, logout, fmt, short };
})();
