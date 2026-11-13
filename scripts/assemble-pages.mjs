import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "pages-dist");
const include = [
  "index.html",
  "styles.css",
  "app.js",
  "fbs-config.js",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "manifest.webmanifest",
  "sw.js",
  "src",
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

function copy(rel) {
  const from = path.join(root, rel);
  const to = path.join(out, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

for (const rel of include) copy(rel);
fs.writeFileSync(path.join(out, ".nojekyll"), "");
const forbidden = ["fixtures", "node_modules", "worker", "tests"];
for (const name of forbidden) {
  if (fs.existsSync(path.join(out, name))) throw new Error(`pages output includes ${name}`);
}
console.log(`wrote ${out}`);
