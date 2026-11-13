import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { interpretStat } from "../src/normalize/common.js";
import { normalizeMembership } from "../src/normalize/membership.js";
import { deriveGameStatus, normalizeGames, recordFromGames } from "../src/normalize/games.js";
import { classifyPollName, normalizePollWeek } from "../src/normalize/polls.js";
import { groupRoster, normalizeRoster } from "../src/normalize/roster.js";
import { normalizePlayerSeasonStats, normalizeTeamSeasonStats } from "../src/normalize/stats.js";
import { acceptRenderable, buildSnapshot } from "../src/normalize/snapshot.js";

const bundle = JSON.parse(fs.readFileSync(new URL("../fixtures/synthetic/bundle.json", import.meta.url)));

test("stat parsing keeps null distinct from zero and scales fraction PCT", () => {
  assert.equal(interpretStat("PCT", "0.673").display, "67.3%");
  assert.equal(interpretStat("PCT", "0").display, "0.0%");
  assert.equal(interpretStat("PCT", null).display, null);
  assert.equal(interpretStat("YDS", "0").display, "0");
  assert.equal(interpretStat("YDS", null).value, null);
  assert.equal(interpretStat("passingTDs", null).display, null);
});

test("membership stays season-bound and drops logos", () => {
  const current = normalizeMembership(bundle.membership["2026"], { requestedSeason: 2026, coverage: "partial" });
  const prior = normalizeMembership(bundle.membership["2025"], { requestedSeason: 2025, coverage: "partial" });
  assert.equal(current.count, 5);
  assert.notEqual(current.count, 138);
  assert.equal(current.countIsCensus, false);
  assert.equal(prior.teams.some((team) => team.school === "West Mock State"), false);
  const eastNow = current.teams.find((team) => team.school === "East Placeholder");
  const eastThen = prior.teams.find((team) => team.school === "East Placeholder");
  assert.equal(eastNow.conference, "Sample Belt");
  assert.equal(eastThen.conference, "Old Sample");
  assert.equal(prior.teams.find((team) => team.providerId === 9005).conference, "Independents");
  assert.equal(Object.hasOwn(current.teams[0], "logos"), false);
  assert.equal(Object.hasOwn(current.teams[0], "color"), false);
  assert.equal(JSON.stringify(current).includes("example.invalid"), false);
});

test("game status does not treat kickoff time as live", () => {
  const games = normalizeGames(bundle.games["2026"], { requestedSeason: 2026, coverage: "partial" });
  const byId = Object.fromEntries(games.games.map((game) => [game.providerId, game]));
  assert.equal(byId[1].home.points, 24);
  assert.equal(byId[1].away.points, 17);
  assert.equal(games.duplicateIdsDropped.length, 1);
  assert.equal(byId[2].status, "scheduled");
  assert.equal(byId[2].home.points, null);
  assert.equal(byId[2].live, false);
  assert.equal(byId[3].status, "postponed");
  assert.equal(byId[4].status, "cancelled");
  assert.equal(byId[6].status, "status_unavailable");
  assert.equal(byId[7].status, "scheduled");
  assert.equal(byId[8].status, "in_progress_snapshot");
  assert.equal(byId[8].live, false);
  assert.equal(byId[10].phase, "regular");
  assert.match(byId[10].notes, /Conference Championship/);
  assert.equal(byId[12].away.points, 0);
  assert.equal(games.quarantinedOtherSeasons.some((row) => row.id === 99), true);
  assert.equal(games.games.some((game) => game.providerId === 99), false);

  const prior = normalizeGames(bundle.games["2025"], { requestedSeason: 2025 });
  const bowl = prior.games.find((game) => game.providerId === 21);
  assert.equal(bowl.season, 2025);
  assert.equal(bowl.phase, "postseason");
  assert.match(bowl.startDate, /^2026-01-01/);
  assert.equal(bowl.live, false);
});

test("records use loaded finals and do not invent 0–0 when games are absent", () => {
  const games = normalizeGames(bundle.games["2026"], { requestedSeason: 2026 }).games;
  const north = recordFromGames(9001, games);
  assert.deepEqual({ wins: north.wins, losses: north.losses, ties: north.ties, unscored: north.unscoredFinals }, {
    wins: 2, losses: 0, ties: 0, unscored: 0,
  });
  const south = recordFromGames(9002, games);
  assert.equal(south.ties, 1);
  assert.equal(south.wins, 0);
  const missing = recordFromGames(9001, null);
  assert.equal(missing.known, false);
  assert.equal(missing.wins, null);
  assert.equal(deriveGameStatus({ completed: false, startDate: "2000-01-01T00:00:00Z", homePoints: null, awayPoints: null }), "scheduled");
});

test("polls keep top 25 only and do not invent release dates or movement", () => {
  assert.equal(classifyPollName("FCS Coaches Poll"), "lower_division");
  assert.equal(classifyPollName("AP Top 25"), "ap");
  assert.equal(classifyPollName("Playoff Committee Rankings"), "cfp");
  const week10 = normalizePollWeek(bundle.rankings[0], { fetchedAt: bundle.fetchedAt, requestedSeason: 2026, requestedWeek: 10 });
  assert.equal(week10.families.ap.ranks.length, 2);
  assert.equal(week10.families.ap.isFinal, null);
  assert.equal(week10.sourcePublicationDate, null);
  assert.equal(JSON.stringify(week10).includes("Should Not Appear"), false);
  assert.equal(JSON.stringify(week10.families.cfp).includes("FCS Example"), false);
  assert.equal(week10.lowerDivisionIgnored[0], "FCS Coaches Poll");
  assert.equal(Object.hasOwn(week10.families.ap.ranks[0], "previousRank"), false);
  assert.equal(Object.hasOwn(week10, "receivingVotes"), false);
  assert.equal(week10.families.ap.ranks[1].firstPlaceVotes, 0);
  const week9 = normalizePollWeek(bundle.rankings[1], { fetchedAt: bundle.fetchedAt });
  assert.equal(week9.families.cfp.state, "not_released");
  assert.equal(week9.families.ap.state, "available");
  const mismatch = normalizePollWeek(bundle.rankings[0], { requestedSeason: 2024, requestedWeek: 10 });
  assert.equal(mismatch.state, "no_data");
  const unknown = normalizePollWeek({
    season: 2026,
    week: 3,
    seasonType: "regular",
    polls: [{ poll: "Mystery Ballot", isFinal: null, ranks: [{ rank: 1, school: "North Fixture", teamId: 1, points: 1, firstPlaceVotes: 1 }] }],
  });
  assert.deepEqual(unknown.unrecognizedPolls, ["Mystery Ballot"]);
  assert.equal(unknown.families.ap.state, "not_released");
});

test("roster omits class and private geography", () => {
  const roster = normalizeRoster(bundle.rosters[0].players, { requestedSeason: 2026, school: "North Fixture" });
  assert.equal(roster.class.included, false);
  const ada = roster.players[0];
  assert.equal(Object.hasOwn(ada, "year"), false);
  assert.equal(Object.hasOwn(ada, "homeLatitude"), false);
  assert.equal(Object.hasOwn(ada, "recruitIds"), false);
  assert.equal(ada.homeCity, "Sample City");
  const bea = roster.players.find((player) => player.lastName === "Nulltown");
  assert.equal(bea.heightInches, null);
  assert.equal(bea.homeCity, null);
  const cy = roster.players.find((player) => player.lastName === "Zero");
  assert.equal(cy.weightPounds, 0);
  assert.equal(cy.jersey, 0);
  assert.equal(JSON.stringify(roster).includes("Freshman"), false);
});

test("roster groups start at quarterback and keep fullbacks after running backs", () => {
  const grouped = groupRoster([
    { lastName: "Safety", position: "FS", jersey: 1 },
    { lastName: "Guard", position: "G", jersey: 70 },
    { lastName: "Corner", position: "CB", jersey: 2 },
    { lastName: "Unknown", position: "XYZ", jersey: 99 },
    { lastName: "Receiver", position: "WR", jersey: 11 },
    { lastName: "Back", position: "RB", jersey: 5 },
    { lastName: "Fullback", position: "FB", jersey: 44 },
    { lastName: "Tackle", position: "OT", jersey: 77 },
    { lastName: "Quarterback", position: "QB", jersey: 12 },
    { lastName: "NoPos", position: "", jersey: 3 },
    { lastName: "Punter", position: "P", jersey: 8 },
    { lastName: "End", position: "TE", jersey: 88 },
  ]);
  assert.deepEqual(grouped.map((group) => group.label), [
    "Quarterbacks",
    "Running backs",
    "Fullbacks",
    "Wide receivers",
    "Tight ends",
    "Offensive line",
    "Cornerbacks",
    "Safeties",
    "Special teams",
    "Other",
    "Unlisted position",
  ]);
  assert.deepEqual(
    grouped.find((group) => group.label === "Offensive line").players.map((player) => player.position),
    ["OT", "G"],
  );
});

test("season stats quarantine the wrong year and describe postseason scope", () => {
  const team = normalizeTeamSeasonStats(bundle.teamStats[0].rows, { requestedSeason: 2026, school: "North Fixture" });
  assert.equal(team.scope.includesPostseason, true);
  assert.equal(team.scope.seasonTypeFilter, false);
  assert.equal(team.stats.some((stat) => stat.value === 15), false);
  assert.equal(team.quarantinedOtherSeasons.length, 1);
  const turnovers = team.stats.find((stat) => stat.name === "turnovers");
  const touchdowns = team.stats.find((stat) => stat.name === "passingTDs");
  assert.equal(turnovers.display, "0");
  assert.equal(touchdowns.display, null);
  const players = normalizePlayerSeasonStats(bundle.playerStats[0].rows, {
    requestedSeason: 2026,
    school: "North Fixture",
    category: "passing",
  });
  assert.equal(players.stats.some((stat) => stat.display === "9999"), false);
  assert.equal(players.stats.find((stat) => stat.statType === "PCT" && stat.playerId === "1").display, "67.3%");
  assert.equal(players.stats.find((stat) => stat.statType === "PCT" && stat.playerId === "4").display, "0.0%");
  assert.equal(players.stats.find((stat) => stat.statType === "YDS" && stat.playerId === "2").display, null);
});

test("built snapshot is labeled synthetic and refuses unlabeled payloads", () => {
  const snapshot = buildSnapshot({
    synthetic: true,
    fetchedAt: bundle.fetchedAt,
    coverage: "partial",
    membership: bundle.membership,
    games: bundle.games,
    rankings: bundle.rankings,
    rosters: bundle.rosters,
    teamStats: bundle.teamStats,
    playerStats: bundle.playerStats,
  });
  assert.equal(snapshot.fixtureClass, "test-only-synthetic");
  assert.equal(snapshot.capabilities.liveScoreboard, false);
  assert.equal(snapshot.capabilities.powerRankingsDisplay, "unavailable");
  assert.equal(snapshot.capabilities.rosterClass, false);
  assert.equal(snapshot.durableQuota, false);
  assert.equal(acceptRenderable(snapshot).mode, "test");
  assert.equal(acceptRenderable({ teams: ["North Fixture"] }).ok, false);
  const file = JSON.parse(fs.readFileSync(new URL("../fixtures/synthetic/normalized-view.json", import.meta.url)));
  assert.equal(file.fixtureClass, "test-only-synthetic");
  assert.equal(file.polls["2026"]["9"].families.cfp.state, "not_released");
});
