import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = process.env.PREVIEW_OUT || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });
const bundlePath = path.join(outDir, "fbs-board-preview.bundle.js");
const htmlPath = path.join(outDir, "fbs-board-preview.html");

const build = spawnSync("npx", ["--yes", "esbuild", path.join(root, "scripts/preview-boot.js"), "--bundle", "--format=iife", "--outfile=" + bundlePath], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status || 1);

const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const js = fs.readFileSync(bundlePath, "utf8");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Offline preview of the FBS Board draft with the November 8 public ESPN capture embedded. Not a live connection.">
<meta name="theme-color" content="#14221c">
<meta name="color-scheme" content="dark light">
<title>FBS Board — offline preview</title>
<style>
${css}
</style>
</head>
<body>
<a class="skip" href="#app">Skip to content</a>
<div id="app">
  <p class="banner plan">Loading the embedded November 8 capture. This file does not contact a server.</p>
</div>
<noscript><p>This preview needs JavaScript. It does not fetch a server. The November 8 capture is inside the file.</p></noscript>
<script>
${js}
</script>
</body>
</html>
`;
fs.writeFileSync(htmlPath, html);
fs.rmSync(bundlePath, { force: true });
const snapshot = JSON.parse(fs.readFileSync(path.join(root, "fixtures/espn/snapshot.json"), "utf8"));
if (!html.includes("Miami Hurricanes") && !html.includes(snapshot.polls["2026"]["10"].families.ap.ranks[0].school)) {
  console.error("preview is missing the captured AP leader");
  process.exit(1);
}
console.log(`wrote ${htmlPath} (${fs.statSync(htmlPath).size} bytes)`);
