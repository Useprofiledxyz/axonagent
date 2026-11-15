// Local dev server: serves the static site and runs the /api handlers the same way Vercel does.
// Usage: copy .env.example to .env, fill it in, then `npm run dev` and open http://localhost:3000
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Minimal .env loader (KEY=value lines).
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".json": "application/json", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.startsWith("/api/")) {
    const file = join(root, normalize(path).replace(/\/$/, "") + ".js");
    if (!file.startsWith(join(root, "api")) || path.split("/").some((p) => p.startsWith("_")) || !existsSync(file)) {
      res.statusCode = 404; return res.end("Not found");
    }
    try {
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    } catch (e) {
      console.error(e); res.statusCode = 500; return res.end(JSON.stringify({ error: e.message }));
    }
  }
  let file = join(root, normalize(path === "/" ? "/index.html" : path));
  if (!file.startsWith(root) || file.includes("node_modules") || file.includes(".env")) { res.statusCode = 404; return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
  res.end(readFileSync(file));
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Axon on http://localhost:${port}`));
