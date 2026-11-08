import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 43123);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function resolveFile(urlPath) {
  const requestPath = decodeURIComponent(urlPath.split("?")[0]);
  const rel = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  if (rel.includes("\0") || rel.split("/").includes("..")) return null;
  const full = path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (full !== root && !full.startsWith(rootPrefix)) return null;
  const blocked = [`${path.sep}.git${path.sep}`, `${path.sep}node_modules${path.sep}`, `${path.sep}ncaa-private${path.sep}`];
  if (blocked.some((part) => full.includes(part))) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (!req.url || req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "cache-control": "no-store" });
    res.end("Method not allowed");
    return;
  }
  const full = resolveFile(req.url);
  if (!full) {
    res.writeHead(403, { "cache-control": "no-store" });
    res.end("Forbidden");
    return;
  }
  fs.stat(full, (error, stat) => {
    const file = !error && stat.isDirectory() ? path.join(full, "index.html") : full;
    fs.readFile(file, (readError, body) => {
      if (readError) {
        res.writeHead(404, { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const type = types[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FBS Board draft http://127.0.0.1:${port}`);
});
