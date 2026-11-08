# Deploy notes

Configured November 8, 2026. Not deployed from this draft.

| Setting | Value |
|---|---|
| Worker name | `fbs-board-data` |
| Worker config | `worker/wrangler.jsonc` |
| Worker entry | `worker/src/index.js` |
| Compatibility date | `2026-11-08` |
| `workers_dev` | `true` (intended URL `https://fbs-board-data.josh-soudah.workers.dev`) |
| `preview_urls` | `false` |
| `ALLOWED_ORIGIN` | `https://joshuasoudah.github.io` |
| Pages path | `https://joshuasoudah.github.io/ncaa-dashboard/` |
| Frontend `apiBase` | `https://fbs-board-data.josh-soudah.workers.dev` |
| Bindings | none |
| Cron | none |

The production Worker calls `globalThis.fetch` and builds ESPN college-football URLs in `src/espn/urls.js`. Tests inject a fake fetch. That fake is not the Worker default.

`npx wrangler deploy --dry-run --config worker/wrangler.jsonc --outdir .wrangler-dry-run` packages the Worker and does not upload it.

`node scripts/assemble-pages.mjs` writes `pages-dist/` for the Pages path. It omits fixtures, tests, and the Worker. Publish that directory as `/ncaa-dashboard/`. The service worker scope is `./`, so it stays under that path.

CORS allows the GitHub Pages origin. It does not authenticate the viewer. Cache hits still count toward the shared Free plan limit of 100,000 Worker requests a day.
