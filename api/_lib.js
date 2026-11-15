// Shared server helpers for Axon (files starting with "_" are not routes on Vercel).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createPublicClient, formatUnits, getAddress, http, isAddress as viemIsAddress, parseAbi, verifyMessage } from "viem";

// ---------- settings (Vercel env vars, or .env when running locally) ----------
// Robinhood Chain (EVM). Defaults are Robinhood Chain mainnet; every value can be overridden.
export function settings() {
  const env = process.env;
  const chainId = Number(env.CHAIN_ID || 4663);
  return {
    tokenAddress: (env.TOKEN_ADDRESS || "").trim(),
    tokenSymbol: (env.TOKEN_SYMBOL || "AXON").trim(),
    requiredAmount: Number(env.REQUIRED_AMOUNT || 1_000_000),
    chainId,
    chainName: env.CHAIN_NAME || "Robinhood Chain",
    rpcUrl: (env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com").trim(),
    explorerUrl: (env.EXPLORER_URL || "https://robinhoodchain.blockscout.com").trim(),
    dailyLimit: Number(env.DAILY_LIMIT || 20),
    // Holder tiers: more tokens held, more builds a day. Multipliers of REQUIRED_AMOUNT / DAILY_LIMIT.
    tiers: [
      { name: "Signal", hold: 1, builds: 1 },
      { name: "Synapse", hold: Number(env.TIER2_HOLD || 5), builds: Number(env.TIER2_BUILDS || 3) },
      { name: "Cortex", hold: Number(env.TIER3_HOLD || 20), builds: Number(env.TIER3_BUILDS || 10) },
    ],
    // DEMO=1 opens the studio to any signed-in wallet (for testing before the token exists).
    demo: env.DEMO === "1" || env.DEMO === "true" || !env.TOKEN_ADDRESS,
  };
}

/** What the browser may see. */
export function publicConfig() {
  const s = settings();
  return {
    demo: s.demo, tokenAddress: s.tokenAddress, tokenSymbol: s.tokenSymbol, requiredAmount: s.requiredAmount,
    dailyLimit: s.dailyLimit, tiers: tierTable(), chainId: s.chainId, chainIdHex: "0x" + s.chainId.toString(16), chainName: s.chainName,
    rpcUrl: s.rpcUrl, explorerUrl: s.explorerUrl,
  };
}

/** Tiers with real numbers: tokens to hold and builds per day. */
export function tierTable() {
  const s = settings();
  return s.tiers.map((t) => ({ name: t.name, minBalance: s.requiredAmount * t.hold, dailyBuilds: s.dailyLimit > 0 ? s.dailyLimit * t.builds : 0 }));
}

/** The tier a balance falls in (the first tier in demo mode or below the minimum). */
export function tierFor(balance) {
  const table = tierTable();
  let tier = table[0];
  for (const t of table) if (balance >= t.minBalance) tier = t;
  return tier;
}

function secret() {
  const s = process.env.AXON_SESSION_SECRET || process.env.SESSION_SECRET || process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  // Fallback when no SESSION_SECRET is set: derive a key from another server-only secret.
  const base = process.env.PROFILE_WALLET_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (base) return createHmac("sha256", base).update("axon:session").digest("base64url");
  throw new Error("Set SESSION_SECRET (at least 16 characters)");
}

// ---------- small signed tokens (nonce and session) ----------
const b64u = (b) => Buffer.from(b).toString("base64url");
export function sign(data) {
  const body = b64u(JSON.stringify(data));
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
export function unsign(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const want = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return data.exp && data.exp < Date.now() ? null : data;
  } catch { return null; }
}
export const newNonce = () => randomBytes(12).toString("hex");

// ---------- EVM: addresses, signatures, token balance ----------
export const isAddress = (s) => typeof s === "string" && viemIsAddress(s, { strict: false });
export const normalize = (s) => getAddress(s);

/** True when `signature` is `address` signing `message` (personal_sign / EIP-191). */
export async function verifyWalletSignature(address, message, signature) {
  try { return await verifyMessage({ address, message, signature }); } catch { return false; }
}

const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]);
let rpcClient, rpcKey;
function chainClient() {
  const s = settings();
  const key = `${s.chainId}|${s.rpcUrl}`;
  if (!rpcClient || rpcKey !== key) {
    rpcKey = key;
    rpcClient = createPublicClient({
      chain: { id: s.chainId, name: s.chainName, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [s.rpcUrl] } } },
      transport: http(s.rpcUrl, { timeout: 10_000 }),
    });
  }
  return rpcClient;
}

/** The wallet's balance of the gate token (whole tokens). */
export async function tokenBalance(owner) {
  const { tokenAddress } = settings();
  if (!tokenAddress) return 0;
  const c = chainClient();
  const [raw, decimals] = await Promise.all([
    c.readContract({ address: tokenAddress, abi: ERC20, functionName: "balanceOf", args: [owner] }),
    c.readContract({ address: tokenAddress, abi: ERC20, functionName: "decimals" }),
  ]);
  return Number(formatUnits(raw, decimals));
}

// ---------- cookies and responses ----------
export const SESSION_COOKIE = "axon_session";
export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
export function setCookie(res, name, value, maxAgeSec) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}
export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel already parsed it
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

/** The signed-in wallet, or null. */
export function session(req) {
  const s = unsign(readCookie(req, SESSION_COOKIE));
  return s && s.kind === "session" && isAddress(s.address) ? s : null;
}

// ---------- daily usage (per server instance; swap for a database or KV to share it) ----------
const usage = new Map();
export function useCredit(address, balance = 0) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${address}`;
  const used = usage.get(key) || 0;
  const dailyLimit = tierFor(balance).dailyBuilds;
  if (dailyLimit > 0 && used >= dailyLimit) return { ok: false, used, limit: dailyLimit };
  usage.set(key, used + 1);
  if (usage.size > 50_000) usage.clear();
  return { ok: true, used: used + 1, limit: dailyLimit };
}
export function creditsUsed(address) {
  return usage.get(`${new Date().toISOString().slice(0, 10)}:${address}`) || 0;
}
/** Give a build back when the agent failed for reasons that weren't the user's. */
export function refundCredit(address) {
  const key = `${new Date().toISOString().slice(0, 10)}:${address}`;
  const used = usage.get(key) || 0;
  if (used > 0) usage.set(key, used - 1);
}
