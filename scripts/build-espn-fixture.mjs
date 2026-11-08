import fs from "node:fs";
import path from "node:path";
import { collectMembership, normalizeRankings, normalizeRoster, normalizeSchedule, normalizeScoreboard, normalizeTeamStatistics } from "../src/espn/normalize.js";

const fetchedAt = "2026-11-08T17:21:00.000Z";
const tmp = "/tmp/espn";
const out = path.resolve(import.meta.dirname, "../fixtures/espn");
fs.mkdirSync(out, { recursive: true });

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(tmp, name), "utf8"));
}

const standings2026 = collectMembership(read("standings-2026.json"), { requestedSeason: 2026 });
const standings2024 = collectMembership(read("standings-2024.json"), { requestedSeason: 2024 });
const scoreboard = normalizeScoreboard(read("scoreboard-current.json"), { requestedSeason: 2026, fetchedAt });
const rankings = normalizeRankings(read("rankings-2026-w10.json"), { requestedSeason: 2026, requestedWeek: 10, fetchedAt });
const week9 = normalizeRankings(read("rankings-2026-w9.json"), { requestedSeason: 2026, requestedWeek: 9, fetchedAt });
const roster2026 = normalizeRoster(read("roster-333-2026.json"), { requestedSeason: 2026, teamId: "333" });
const roster2025 = normalizeRoster(read("roster-333-2025.json"), { requestedSeason: 2025, teamId: "333" });
const stats2025 = normalizeTeamStatistics(read("stats-333-2025.json"), { requestedSeason: 2025, teamId: "333" });
const bowl = normalizeSchedule(read("schedule-333-2024-post.json"), { requestedSeason: 2024, seasonType: 3 });
const sunday = JSON.parse(fs.readFileSync(path.join(tmp, "scoreboard-20261108.json"), "utf8"));

const byConference = (membership) => {
  const counts = {};
  for (const team of membership.teams) counts[team.conference] = (counts[team.conference] || 0) + 1;
  return counts;
};

const manifest = {
  fixtureClass: "public-espn-capture",
  fetchedAt,
  note: "Trimmed from public ESPN responses. Not a live connection and not a complete feed mirror.",
  liveClockObserved: false,
  observedScoreboardStates: ["post/STATUS_FINAL", "post/STATUS_FINAL Final/OT"],
  requests: [
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=100", http: 200, events: scoreboard.games.length, live: scoreboard.liveCount },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&dates=20261108&limit=100", http: 200, events: (sunday.events || []).length },
    { url: "https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=2026", http: 200, teams: standings2026.count },
    { url: "https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=2024", http: 200, teams: standings2024.count },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&week=10&seasontype=2", http: 200 },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings?seasons=2026&week=9&seasontype=2", http: 200, result: week9.state, echoedWeek: week9.week },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/roster?season=2026", http: 200, players: roster2026.players.length },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/roster?season=2025", http: 200, state: roster2025.state },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/statistics?season=2025", http: 200, state: stats2025.state, returnedSeason: stats2025.returnedSeason },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/schedule?season=2024&seasontype=3", http: 200, events: bowl.games.length, topLevelSeason: bowl.topLevelSeason },
    { url: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/333/depthcharts", http: 200, depthChartItems: 0 },
  ],
  conferenceCounts2026: byConference(standings2026),
  conferenceCounts2024: byConference(standings2024),
};

const snapshot = {
  contractVersion: 1,
  fixtureClass: "public-espn-capture",
  synthetic: false,
  source: "espn-public-capture",
  provider: "espn",
  state: "stale_snapshot",
  staleReason: "Saved from public ESPN reads on Nov 8, 2026. This file is not a live connection.",
  fetchedAt,
  sourcePublicationDate: null,
  liveSchema: true,
  liveClockObserved: false,
  defaultSeason: 2026,
  seasons: [2026, 2024],
  capabilities: {
    liveScoreboardSchema: true,
    liveClockObserved: false,
    livePlayByPlay: false,
    rosterClass: true,
    headshots: "when the roster payload includes a URL",
    verifiedStarters: false,
    pollDateLabel: true,
    pollPreviousRank: true,
    receivingVotes: true,
    powerRankingsDisplay: "unavailable",
    powerWeightsApproved: false,
  },
  quotaEnforcement: "none",
  durableQuota: false,
  memberships: { 2026: standings2026, 2024: standings2024 },
  games: {
    2026: { ...scoreboard, note: "Current week-10 scoreboard with groups=80 and limit=100. Not certified as every FBS game." },
    2024: { ...bowl, note: "One postseason event. Filed by the event season (2024), not the response's top-level season (2026)." },
  },
  polls: { 2026: { 10: rankings } },
  pollWarnings: [week9],
  rosters: {
    "2026:333": roster2026,
    "2025:333": roster2025,
  },
  teamStats: { "2025:333": stats2025 },
  playerStats: {},
  notices: [
    "No in-progress game was in the Nov 8 scoreboard. Status objects include state, name, completed, displayClock, and period, but every captured game was final.",
    week9.reason,
    stats2025.reason,
    roster2025.reason,
  ],
};

fs.writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(out, "snapshot.json"), `${JSON.stringify(snapshot)}\n`);
console.log(JSON.stringify({
  teams2026: standings2026.count,
  teams2024: standings2024.count,
  games: scoreboard.games.length,
  live: scoreboard.liveCount,
  ap: rankings.families.ap.ranks.length,
  votes: rankings.families.ap.receivingVotes.length,
  roster: roster2026.players.length,
  roster2025: roster2025.state,
  stats: stats2025.state,
  week9: week9.state,
  bowl: bowl.games.length,
}, null, 2));
