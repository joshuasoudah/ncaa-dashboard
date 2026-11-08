# Public ESPN reads, November 8, 2026

Fetched from this draft around 11:21 AM America/Chicago (`2026-11-08T17:21:00Z`). Every request below returned HTTP 200. No API key was sent. CollegeFootballData was not called.

| URL | What came back |
|---|---|
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=100 | Season 2026, week 10, 63 events. 61 `Final`, 2 `Final/OT`. Status objects include `state`, `name`, `completed`, `displayClock`, and `period`. Every `state` was `post` and every `type.name` was `STATUS_FINAL`. `displayClock` on finals was `0:00`. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&seasontype=2&week=10&year=2026&limit=5 | Same week. `limit=5` still returned 10 events. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&dates=20261108&limit=100 | 0 events on Sunday, November 8. |
| https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=2026 | Recursive walk, including Sun Belt East and West: 138 teams. North Dakota State in the Mountain West. Sacramento State in the Mid-American Conference. |
| https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=2024 | Same walk: 134 teams. North Dakota State and Sacramento State are absent. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&week=10&seasontype=2 | AP, Coaches, and CFP each have 25 teams. ESPN date labels: CFP `2026-11-03T08:00Z`, AP and Coaches `2026-11-01T07:00Z`. AP and Coaches include an `others` list. CFP `points` and `firstPlaceVotes` were all 0, so they are not shown as point totals. CFP `previous` was 0 for the top of the poll; that is shown as “previous not ranked,” not as a rank change. Lower-division polls in the same payload are ignored. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&week=9&seasontype=2 | The body echoed `requestedSeason.week.number` 10 and poll occurrence 10. It is not used as a week 9 poll. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/roster?season=2026 | 100 Alabama players. `experience.displayValue` is Freshman, Sophomore, Junior, or Senior. 94 headshot URLs. Injuries arrays were empty. No starter field. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/roster?season=2025 | Season year 2025, groups present, every group empty. Not replaced with the 2026 roster. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/statistics?season=2025 | Top-level `season.year` is 2026 while `requestedSeason.year` is 2025. Stat values are withheld. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/schedule?season=2024&seasontype=3 | Top-level season 2026. The one event is season 2024, ReliaQuest Bowl, Alabama 13 at Michigan 19, December 31, 2024. The app files it under 2024. |
| https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/depthcharts | HTTP 200, no depth-chart entries. Starters are not inferred. |

`teams?groups=80` was not used. An earlier read of that route returned 763 teams and is not an FBS list.

The NFL board’s public page loads `https://nfl-live-data.josh-soudah.workers.dev` and treats a game as live when `status.type` is not completed and `state` is `in` or the name is `STATUS_IN_PROGRESS`, `STATUS_HALFTIME`, `STATUS_END_PERIOD`, or `STATUS_DELAYED` (`logic.js` `isLive`). This draft uses that same predicate. No college event in this capture matched it, so live behavior and latency were not observed.

The saved view is `fixtures/espn/snapshot.json`, with the request list in `fixtures/espn/manifest.json`.
