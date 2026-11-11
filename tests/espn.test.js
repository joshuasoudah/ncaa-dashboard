import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isLive } from "../src/espn/live.js";
import { collectMembership, normalizeEvent, normalizeRankings, normalizeRoster, normalizeTeamStatistics } from "../src/espn/normalize.js";
import { createTtlCache } from "../src/espn/cache.js";
import { createRefreshLoop } from "../src/live/refresh.js";
import { assertEspnUrl } from "../src/espn/urls.js";

const snapshot = JSON.parse(fs.readFileSync(new URL("../fixtures/espn/snapshot.json", import.meta.url)));

test("captured standings differ by season and keep nested Sun Belt teams", () => {
  assert.equal(snapshot.memberships["2026"].count, 138);
  assert.equal(snapshot.memberships["2024"].count, 134);
  const ndsu = snapshot.memberships["2026"].teams.find((team) => team.school === "North Dakota State Bison");
  assert.equal(ndsu.conference, "Mountain West Conference");
  assert.equal(snapshot.memberships["2024"].teams.some((team) => team.school === "North Dakota State Bison"), false);
  const sun = snapshot.memberships["2026"].teams.filter((team) => team.conference === "Sun Belt Conference");
  assert.equal(sun.length, 14);
  assert.deepEqual(new Set(sun.map((team) => team.division)), new Set(["Sun Belt - East", "Sun Belt - West"]));
});

test("week 10 polls stay at 25 and a week 9 echo is not relabeled", () => {
  const week = snapshot.polls["2026"]["10"];
  assert.equal(week.families.ap.ranks.length, 25);
  assert.equal(week.families.coaches.ranks.length, 25);
  assert.equal(week.families.cfp.ranks.length, 25);
  assert.equal(week.families.ap.ranks[0].school, "Miami Hurricanes");
  assert.equal(week.families.ap.ranks[0].previousRank, 1);
  assert.equal(week.families.cfp.pointsUsed, false);
  assert.equal(week.families.cfp.ranks[0].previousUnranked, true);
  assert.equal(week.families.cfp.ranks[0].trend, null);
  assert.equal(week.families.ap.receivingVotes.length, 10);
  assert.equal(week.families.ap.receivingVotes.every((row) => row.school), true);
  assert.equal(week.lowerDivisionIgnored.some((name) => /FCS/.test(name)), true);
  assert.equal(week.families.ap.ranks.some((rank) => /FCS/.test(rank.school)), false);
  const warning = snapshot.pollWarnings[0];
  assert.equal(warning.state, "wrong_week");
  assert.equal(warning.requestedWeek, 9);
  assert.equal(warning.week, 10);
});

test("scoreboard capture is final-only and the bowl keeps the event season", () => {
  assert.equal(snapshot.liveClockObserved, false);
  assert.equal(snapshot.games["2026"].liveCount, 0);
  assert.equal(snapshot.games["2026"].games.every((game) => game.live === false), true);
  assert.ok(snapshot.games["2026"].games.some((game) => game.statusLabel === "Final/OT"));
  const bowl = snapshot.games["2024"].games[0];
  assert.equal(bowl.season, 2024);
  assert.equal(bowl.phase, "postseason");
  assert.equal(bowl.home.points, 19);
  assert.equal(bowl.away.points, 13);
  assert.match(bowl.notes, /ReliaQuest Bowl/);
});

test("Alabama roster keeps class and does not invent starters; 2025 and stats stay withheld", () => {
  const roster = snapshot.rosters["2026:333"];
  assert.equal(roster.players.length, 100);
  assert.equal(roster.players[0].classLabel, "Freshman");
  assert.equal(roster.starters, null);
  assert.equal(roster.players.some((player) => !player.headshot), true);
  assert.equal(snapshot.rosters["2025:333"].state, "no_data");
  assert.equal(snapshot.rosters["2025:333"].players.length, 0);
  assert.equal(snapshot.teamStats["2025:333"].state, "season_mismatch");
  assert.equal(snapshot.teamStats["2025:333"].stats.length, 0);
  assert.equal(snapshot.teamStats["2025:333"].returnedSeason, 2026);
});

test("final display clocks are not live, and an in-progress status is", () => {
  const finalStatus = { clock: 0, displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" } };
  assert.equal(isLive(finalStatus), false);
  const liveStatus = { displayClock: "8:21", period: 2, type: { name: "STATUS_IN_PROGRESS", state: "in", completed: false, shortDetail: "2nd 8:21" } };
  assert.equal(isLive(liveStatus), true);
  const event = normalizeEvent({
    id: "schema-only",
    date: "2026-11-07T20:00:00Z",
    season: { year: 2026, type: 2 },
    week: { number: 10 },
    competitions: [{
      neutralSite: false,
      status: liveStatus,
      competitors: [
        { homeAway: "home", score: "10", team: { id: "1", location: "Schema", name: "Home" } },
        { homeAway: "away", score: "7", team: { id: "2", location: "Schema", name: "Away" } },
      ],
    }],
  }, { requestedSeason: 2026 });
  assert.equal(event.game.live, true);
  assert.equal(event.game.clockLabel, "Q2 8:21");
  assert.equal(event.game.home.points, 10);
});

test("nested conferences are not dropped when the parent has no entries", () => {
  const membership = collectMembership({
    name: "FBS",
    children: [
      { name: "Flat Conference", standings: { entries: [{ team: { id: "1", displayName: "Flat Team" }, stats: [{ type: "total", name: "overall", displayValue: "1-0" }] }] } },
      {
        name: "Sun Belt Conference",
        children: [
          { name: "Sun Belt - East", standings: { entries: [{ team: { id: "2", location: "East", name: "Sample" }, stats: [] }] } },
          { name: "Sun Belt - West", standings: { entries: [{ team: { id: "3", location: "West", name: "Sample" }, stats: [] }] } },
        ],
      },
    ],
  }, { requestedSeason: 2026 });
  assert.equal(membership.count, 3);
  assert.equal(membership.teams.filter((team) => team.conference === "Sun Belt Conference").length, 2);
});

test("rankings and roster normalizers reject substituted seasons", () => {
  const wrongWeek = normalizeRankings({
    requestedSeason: { year: 2026, week: { number: 10 } },
    rankings: [{ type: "ap", name: "AP Top 25", occurrence: { number: 10 }, ranks: [{ current: 1, team: { id: "1", location: "Miami", name: "Hurricanes" } }] }],
  }, { requestedWeek: 9 });
  assert.equal(wrongWeek.state, "wrong_week");
  assert.equal(wrongWeek.families.ap.ranks.length, 0);
  const emptyRoster = normalizeRoster({ season: { year: 2025 }, athletes: [{ position: "offense", items: [] }] }, { requestedSeason: 2025, teamId: "333" });
  assert.equal(emptyRoster.state, "no_data");
  const stats = normalizeTeamStatistics({ season: { year: 2026 }, requestedSeason: { year: 2025 }, results: { stats: { categories: [{ name: "passing" }] } } }, { requestedSeason: 2025 });
  assert.equal(stats.state, "season_mismatch");
  assert.equal(stats.stats.length, 0);
  const mapped = normalizeTeamStatistics({
    season: { year: 2026 },
    requestedSeason: { year: 2026 },
    results: { stats: { categories: [{ name: "passing", displayName: "Passing", stats: [{ abbreviation: "CMP%", displayValue: "69.4", value: 69.4 }, { abbreviation: "YDS", displayValue: "", value: null }] }] } },
  }, { requestedSeason: 2026 });
  assert.equal(mapped.state, "available");
  assert.equal(mapped.stats.length, 1);
  assert.equal(mapped.stats[0].display, "69.4");
  const none = normalizeTeamStatistics({ season: { year: 2026 }, requestedSeason: { year: 2026 }, results: { stats: { categories: [] } } }, { requestedSeason: 2026 });
  assert.equal(none.state, "no_data");
  assert.match(none.reason, /ESPN returned no season stats/);
});

test("short cache coalesces concurrent ESPN reads and does not claim account quota", async () => {
  let calls = 0;
  let now = 0;
  const cache = createTtlCache({ ttlMs: 15000, now: () => now });
  const factory = () => new Promise((resolve) => {
    calls += 1;
    setTimeout(() => resolve({ ok: true }), 20);
  });
  const [first, second] = await Promise.all([cache.get("scoreboard", factory), cache.get("scoreboard", factory)]);
  assert.equal(calls, 1);
  assert.equal(first.cache === "miss" || second.cache === "miss", true);
  assert.equal(first.cache === "coalesced" || second.cache === "coalesced", true);
  now = 1000;
  const third = await cache.get("scoreboard", factory);
  assert.equal(third.cache, "hit");
  assert.equal(calls, 1);
  now = 20000;
  await cache.get("scoreboard", async () => {
    calls += 1;
    return { ok: true };
  });
  assert.equal(calls, 2);
  assert.equal(cache.durableAccountQuota, false);
});

test("auto-refresh does not tick while hidden or without a service", () => {
  let ticks = 0;
  let hidden = false;
  let enabled = true;
  let service = false;
  const loop = createRefreshLoop({
    isHidden: () => hidden,
    isEnabled: () => enabled,
    hasService: () => service,
    onTick: () => { ticks += 1; },
  });
  assert.equal(loop.tick(), "no-service");
  service = true;
  hidden = true;
  assert.equal(loop.tick(), "hidden");
  hidden = false;
  enabled = false;
  assert.equal(loop.tick(), "disabled");
  enabled = true;
  assert.equal(loop.tick(), "running");
  assert.equal(ticks, 1);
});

test("the worker URL builder rejects non-ESPN hosts", () => {
  assert.throws(() => assertEspnUrl("https://example.com/apis/site/v2/scoreboard"), /upstream_not_allowed/);
  assert.equal(assertEspnUrl("https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard").host, "site.api.espn.com");
});
