# FBS Board

Unpublished local draft of a college football companion. It is separate from the NFL standings board and is not deployed.

The screen starts **disconnected**. It does not call ESPN, CollegeFootballData, or any other provider on its own. A button loads a captured public ESPN snapshot that was saved in this draft on November 8, 2026.

## Run

```bash
npm test
npm start
```

The draft server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). `npm test` rebuilds the older synthetic fixture and runs the unit tests. It does not contact ESPN.

Open `/?snapshot=captured` to load the saved snapshot without clicking. `view=ap` or `view=games` selects a tab. `theme=light` switches theme.

## What this draft does

- Mobile-first Rankings and Games shell, dark and light themes, conference color strokes, and a legend.
- Season membership from the public ESPN standings walk: 138 FBS teams in 2026 and 134 in 2024, including Sun Belt divisions. Counts are not hardcoded.
- Week 10 AP, Coaches, and CFP top 25 from the public rankings payload, plus others receiving votes when ESPN included them. Ranks stop at 25.
- Week 10 scoreboard (63 games, all final, including overtime). LIVE is implemented for ESPN in-progress statuses and is not applied to final games, even when `displayClock` is `0:00`.
- Alabama 2026 roster with class and headshot URLs when ESPN sent them. No starter tags. The 2025 roster response was empty and is not backfilled. A 2025 statistics response whose top-level season was 2026 is withheld.
- One 2024 postseason event (ReliaQuest Bowl), filed by the event season rather than the response’s top-level season.
- Reopening resets tabs, conference, the live filter, and open panels. Theme and the auto-refresh preference stay. Auto-refresh pauses while the tab is hidden and does not run without a configured service.
- Optional worker source in `src/worker/app.js` fetches only built ESPN URLs, normalizes them, and coalesces concurrent reads in a 15-second process cache. It is not deployed. Upstream calls are off unless a test enables them.

## What it does not do

- No deployment, no Cloudflare resources, no cron, no changes to the NFL app or worker.
- No durable account-wide request counter. Cloudflare’s 100,000 requests a day are not enforced here.
- Power rankings stay hidden. The 40/30/20/10 candidate in `src/power/candidate.js` is unapproved and disabled.
- No live clock was observed on November 8, 2026. The status schema is present; every captured game was final. Sunday’s dated scoreboard had zero events.
- A rankings request for week 9 echoed week 10. Those polls are not shown as week 9.
- iPhone and home-screen behavior were not checked on a device.

Evidence URLs and the capture notes are in `docs/EVIDENCE.md`. Remaining release gates are in `docs/REMAINING-GATES.md`.
