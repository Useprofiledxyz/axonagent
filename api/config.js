import { json, publicConfig } from "./_lib.js";

// GET /api/config: token gate settings the browser shows (no secrets).
export default function handler(req, res) {
  json(res, 200, publicConfig());
}
