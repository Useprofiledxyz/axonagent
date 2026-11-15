import { isAddress, json, newNonce, normalize, settings, sign } from "../_lib.js";

// GET /api/auth/nonce?address=<wallet>: a sign-in message for this wallet, valid 5 minutes.
export default function handler(req, res) {
  const address = new URL(req.url, "http://x").searchParams.get("address") || "";
  if (!isAddress(address)) return json(res, 400, { error: "That isn't a wallet address" });
  const wallet = normalize(address);
  const issuedAt = new Date().toISOString();
  const nonce = newNonce();
  const message = `Axon sign-in\n\nWallet: ${wallet}\nChain: ${settings().chainName} (${settings().chainId})\nNonce: ${nonce}\nIssued: ${issuedAt}\n\nSigning is free and does not send a transaction.`;
  const ticket = sign({ kind: "nonce", address: wallet, message, exp: Date.now() + 5 * 60_000 });
  json(res, 200, { message, ticket });
}
