# NCAA dashboard

Unofficial college football board for the Football Bowl Subdivision. It uses the same public ESPN reads as the separate NFL standings app, through its own Worker and its own GitHub Pages path. It is not affiliated with ESPN, the NCAA, the College Football Playoff, any conference, or any school.

This repository is the source. The intended public addresses, once a person deploys them, are:

- Site: `https://joshuasoudah.github.io/ncaa-dashboard/`
- Worker: `https://fbs-board-data.josh-soudah.workers.dev`

Those addresses are configuration. Publishing this tree does not by itself create the GitHub repository or the Worker.

## What you can do with it

The page matches the NFL standings layout: navy header, red refresh button, toolbar, settings, and expandable team rows. College controls in that toolbar are season, list type, conference, division, and week.

- **FBS** lists the season’s Football Bowl Subdivision teams from the standings feed, sorted by the recorded win-loss line. That sort is not a power ranking.
- **AP, Coaches, and CFP** show the returned top 25 only, plus others receiving votes when ESPN included them.
- **Power** stays unavailable. A candidate formula exists in `src/power/candidate.js` and is not approved.
- Opening a team shows Games, Roster, and Stats. Refresh keeps that team open. Leaving the tab and coming back closes panels and returns conference, division, and Live now to All.
- A thin stripe is the team’s conference. A glow in that color appears only when ESPN marks the game in progress. Final games stay plain, even when the clock reads `0:00`.

The header says **Snapshot** until a refresh is actually running. It does not mean the scoreboard is live.

## Architecture

```text
Browser  /ncaa-dashboard/          Worker  fbs-board-data
index, CSS, JS modules    GET      /v1/board  /v1/roster  /v1/stats  /v1/schedule
fbs-board-* storage                |
                                   |  built ESPN URLs only
                                   v
                          site.api.espn.com  college-football
```

The browser never chooses an ESPN URL. The Worker builds one URL per route, normalizes the JSON, and returns that view. A `url` parameter is rejected.

One board refresh is one Worker request and up to three ESPN reads: membership, rankings, and the scoreboard. Roster, stats, and a single-team schedule are separate requests when those tabs open. Identical in-flight reads share one upstream call.

Cache TTLs on the public responses:

| View | Fresh for |
|---|---|
| Scoreboard | 15 seconds |
| Stats | 30 minutes |
| Roster | 2 hours |
| Rankings and team schedule | 6 hours |
| Membership | 24 hours |

A cache hit still counts as a Worker request. The cache key is the route and query only. It does not store cookies or account identity. CORS allows `https://joshuasoudah.github.io` and is not a login. GitHub Pages paths share that origin, so the path `/ncaa-dashboard/` is not a security boundary. The service worker, manifest, and `fbs-board-prefs-v1` storage are still limited to this app and do not use the NFL names.

The account Worker allowance is 100,000 requests a day on the Free plan, shared with the NFL Worker. On November 8, 2026, around 12:32 PM Central, the account was near 406 requests that day. This package does not meter that account limit.

There is no D1 database, KV namespace, or cron trigger.

## Run locally

```bash
npm install
npm test
npm start
```

`npm test` does not call ESPN. `npm start` serves the static files on port 43123 and does not call ESPN either. The page then requests `https://fbs-board-data.josh-soudah.workers.dev` if that Worker is already deployed. Until it is, those requests fail and the last good view stays empty, with an error banner.

`?snapshot=captured` loads a saved November 8 file only when the hostname is `localhost` or `127.0.0.1`. A production host ignores it.

## Deploy

The college Worker is a separate script, `fbs-board-data`, intended at `https://fbs-board-data.josh-soudah.workers.dev`. `fbs-config.js` sets `apiBase` to that origin. The page calls only its `/v1/...` routes. Do not point this site at the NFL Worker.

GitHub Pages for this repository is `https://joshuasoudah.github.io/ncaa-dashboard/`. The workflow `.github/workflows/pages.yml` (`Deploy GitHub Pages`) runs on every push to `main` and on `workflow_dispatch`. It runs `npm test`, builds `pages-dist/` with `node scripts/assemble-pages.mjs`, and deploys that directory. `pages-dist/` contains the static app only. Fixtures, tests, and the Worker are not in it. Asset URLs are relative, and the service worker is registered as `./sw.js` with scope `./`, so both stay under `/ncaa-dashboard/`. Its cache names start with `fbs-board-`.

Before that workflow can publish, the repository Pages setting must be GitHub Actions, not a branch folder:

`POST /repos/joshuasoudah/ncaa-dashboard/pages` with `{ "build_type": "workflow" }`.

If a push runs before that setting exists, the deploy job fails until Pages is set, then run **Deploy GitHub Pages** with `workflow_dispatch`. This file does not enable Pages by itself.

## Smoke tests after the Worker exists

Use small requests. Do not loop every team.

```bash
curl -sS "https://fbs-board-data.josh-soudah.workers.dev/v1/capabilities"
curl -sS -D - -o /dev/null -H "Origin: https://joshuasoudah.github.io" \
  "https://fbs-board-data.josh-soudah.workers.dev/v1/board?season=2026&week=10&seasontype=2"
curl -sS -H "Origin: https://joshuasoudah.github.io" \
  "https://fbs-board-data.josh-soudah.workers.dev/v1/roster?team=333&season=2026"
curl -sS -H "Origin: https://joshuasoudah.github.io" \
  "https://fbs-board-data.josh-soudah.workers.dev/v1/stats?team=333&season=2025"
curl -sS -H "Origin: https://example.com" \
  "https://fbs-board-data.josh-soudah.workers.dev/v1/board?season=2026&week=10&seasontype=2"
```

Expect a JSON board for 2026 week 10, an Alabama roster for 2026, a withheld 2025 stats body when the payload’s top-level season is 2026, and HTTP 403 for the other origin. `OPTIONS` to the same board URL should return 204 for `https://joshuasoudah.github.io`.

## Maintenance

Change the ESPN paths only in `src/espn/urls.js`. Keep normalization in `src/espn/normalize.js` and `src/service/handler.js`. Bump a cache TTL there if a route gets too hot, and remember each browser refresh still spends a Worker request. Re-run `npm test` and the Wrangler dry run after a compatibility-date change. Do not add a cron that polls ESPN in the background.

## Known gaps

- No in-progress college game was on the public scoreboard checked November 8, 2026. The status fields exist. A live clock and its delay were not observed.
- Power rankings are not approved and are not shown.
- A week 9 rankings request that day came back as week 10. The app refuses to label that body as week 9.
- Alabama’s 2025 roster response was empty. The 2026 roster is not copied backward.
- A statistics request for 2025 came back with top-level season 2026. Those figures are withheld.
- The default board refresh is the regular-season scoreboard for the selected week. It does not download every team’s postseason schedule.
- The 2026 standings walk was 138 teams and the 2024 walk was 134. A later season can differ. The app does not hardcode those counts.
- iPhone Safari and the home-screen icon were not checked on a phone.
- The site URL above is the Pages target. It is live only after the workflow run is green and the parent has confirmed the deployment.
