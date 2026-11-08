# Deployment package (not activated)

Nothing in this file has been deployed. `ALLOWED_ORIGIN` is empty, so a browser `Origin` is rejected until it is set.

## Worker

- Directory: `worker/`
- Config: `worker/wrangler.jsonc`
- Name to create later: `fbs-board-data`
- Entry: `worker/src/index.js`
- `compatibility_date`: `2026-11-08`
- `compatibility_flags`: `nodejs_compat`
- `workers_dev`: `false`
- `preview_urls`: `false`
- Observability logs and traces: enabled in config only. No Cloudflare resource was created.
- Bindings: none. No D1, KV, or cron.
- Variable: `ALLOWED_ORIGIN` (plain var, not a secret). Set it to the future Pages origin, for example `https://<user>.github.io`, before any deploy. Leave it empty until then.

Routes the page is allowed to call:

- `GET /v1/board?season=&week=&seasontype=2` — one Worker request, up to three cached ESPN reads (membership, rankings, scoreboard)
- `GET /v1/roster?team=&season=`
- `GET /v1/stats?team=&season=`
- `GET /v1/schedule?team=&season=&seasontype=`
- `GET /v1/membership`, `/v1/rankings`, `/v1/scoreboard`, `/v1/capabilities`

ESPN URLs are built in code. A `url` query parameter is rejected. TTLs: scoreboard 15 seconds, stats 30 minutes, roster 2 hours, rankings and schedules 6 hours, membership 24 hours. Cache keys are public route keys only.

A cache hit still counts as one Worker request. CORS and this cache do not enforce the account's 100,000 requests/day, which is shared with the NFL Worker.

Check without deploying:

```bash
npm install
npm test
npx wrangler deploy --dry-run --config worker/wrangler.jsonc --outdir .wrangler-dry-run
```

## Pages

- Static files at the repo root, served from a subpath such as `/fbs-board/`.
- `fbs-config.js` sets `globalThis.FBS_CONFIG.apiBase`. It is `""` in this draft, so the page stays disconnected.
- Set `apiBase` to the Worker origin only after that Worker exists and `ALLOWED_ORIGIN` matches the Pages origin.
- `?snapshot=captured` loads the saved capture only on `localhost` or `127.0.0.1`. It is not a production mode.
- The service worker is `./sw.js`, cache prefix `fbs-board-`, and it is not registered on localhost.

## Still needs a person

1. A GitHub repository destination. This environment cannot create one.
2. Approval to deploy the Worker and to set `ALLOWED_ORIGIN`.
3. Approval to turn on GitHub Pages for that repo and to put the site in its own path, not the NFL path.
4. Confirmation the shared free Worker quota has room beside the NFL app.
