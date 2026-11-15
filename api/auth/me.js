import { creditsUsed, json, session, tierFor } from "../_lib.js";

// GET /api/auth/me: the signed-in wallet and today's usage, or 401.
export default function handler(req, res) {
  const s = session(req);
  if (!s) return json(res, 401, { error: "Not signed in" });
  const tier = tierFor(s.balance || 0);
  json(res, 200, { address: s.address, balance: s.balance, tier: tier.name, used: creditsUsed(s.address), limit: tier.dailyBuilds });
}
