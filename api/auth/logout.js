import { SESSION_COOKIE, json, setCookie } from "../_lib.js";

// POST /api/auth/logout: clears the session cookie.
export default function handler(req, res) {
  setCookie(res, SESSION_COOKIE, "", 0);
  json(res, 200, { ok: true });
}
