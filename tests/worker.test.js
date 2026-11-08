import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHandler } from "../src/service/handler.js";
import { createTimedCache } from "../src/service/cache.js";

test("the worker entry delegates to the handler and does not proxy raw URLs", () => {
  const entry = fs.readFileSync(new URL("../worker/src/index.js", import.meta.url), "utf8");
  const config = fs.readFileSync(new URL("../worker/wrangler.jsonc", import.meta.url), "utf8");
  assert.match(entry, /export default/);
  assert.match(entry, /async fetch/);
  assert.match(config, /"compatibility_date": "2026-11-08"/);
  assert.match(config, /"workers_dev": false/);
  assert.equal(config.includes("d1"), false);
  assert.equal(config.includes("kv_namespaces"), false);
  assert.equal(config.includes("cron"), false);
  assert.equal(entry.includes("nfl-live-data"), false);
});

test("an empty allowed origin rejects browser origins and allows a direct GET", async () => {
  const handle = createHandler({
    cache: createTimedCache({ now: () => 0 }),
    allowedOrigin: "",
    fetch: async () => Response.json({ children: [] }),
  });
  const browser = await handle(new Request("http://fbs.local/v1/capabilities", { headers: { Origin: "https://joshuasoudah.github.io" } }));
  assert.equal(browser.status, 403);
  const direct = await handle(new Request("http://fbs.local/v1/capabilities"));
  assert.equal(direct.status, 200);
});
