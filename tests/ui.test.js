import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseHTML } from "linkedom";
import { buildSnapshot } from "../src/normalize/snapshot.js";
import { createSession, initialLoadPlan, reopen } from "../src/ui/session.js";
import { renderApp } from "../src/ui/render.js";

const bundle = JSON.parse(fs.readFileSync(new URL("../fixtures/synthetic/bundle.json", import.meta.url)));
const synthetic = buildSnapshot({
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
const capture = JSON.parse(fs.readFileSync(new URL("../fixtures/espn/snapshot.json", import.meta.url)));

function mount(session, data, extra = {}) {
  const { document } = parseHTML("<!doctype html><div id='app'></div>");
  const root = document.getElementById("app");
  renderApp(root, { session, snapshot: data, theme: "dark", themeChoice: "dark", reduceMotion: true, autoRefresh: true, serviceConnected: false, status: "", ...extra });
  return root;
}

test("startup loads the service unless a local capture was requested", () => {
  assert.equal(initialLoadPlan({ serviceBase: "https://fbs-board-data.josh-soudah.workers.dev", localPreview: false, captureRequested: true }), "service");
  assert.equal(initialLoadPlan({ serviceBase: "https://fbs-board-data.josh-soudah.workers.dev", localPreview: true, captureRequested: true }), "capture");
  assert.equal(initialLoadPlan({ serviceBase: "", localPreview: false, captureRequested: false }), "idle");
});

test("disconnected shell matches the standings toolbar and invents no teams", () => {
  const session = createSession();
  assert.equal(session.rankingView, "fbs");
  const root = mount(session, null);
  const text = root.textContent;
  assert.match(text, /FBS Board/);
  assert.match(text, /Not connected/);
  assert.match(text, /does not contact ESPN/);
  assert.equal(text.includes("Miami Hurricanes"), false);
  assert.equal(text.includes("North Fixture"), false);
  assert.equal(root.querySelector("#refresh").textContent, "Refresh now");
  assert.equal(root.querySelector("#theme-toggle").textContent, "Dark");
  assert.equal(root.querySelector("#settings-open"), null);
  assert.equal(root.querySelector("#live-only"), null);
  assert.equal(root.querySelector("#ranking-view"), null);
  assert.equal(root.querySelector("[data-live], .live-pill, .live-dot.on"), null);
  assert.equal(root.querySelector("input[type=search]"), null);
});

test("a configured service loads as FBS and does not say refresh skips ESPN", () => {
  const session = createSession();
  const root = mount(session, null, { serviceConnected: true });
  const text = root.textContent;
  assert.match(text, /Checking the scoreboard service/);
  assert.match(text, /Loading/);
  assert.equal(text.includes("does not contact ESPN"), false);
  assert.equal(text.includes("Not connected"), false);
  assert.equal(root.querySelector("#theme-toggle").textContent, "Dark");
  const loaded = structuredClone(capture);
  loaded.source = "fbs-board-service";
  loaded.fixtureClass = null;
  loaded.synthetic = false;
  loaded.state = "fresh_snapshot";
  const ready = mount(session, loaded, { serviceConnected: true });
  assert.match(ready.textContent, /Service · 138 teams/);
  assert.match(ready.textContent, /live clock was not measured/);
  assert.equal(ready.textContent.includes("not a live scoreboard"), false);
  const stale = mount(session, { ...loaded, state: "stale_snapshot" }, { serviceConnected: true });
  assert.match(stale.textContent, /Stale cached service data/);
});

test("captured polls follow CFP order, cap at 50, and show no power ranks", () => {
  const session = createSession();
  session.rankingView = "power";
  const ranked = mount(session, capture);
  assert.match(ranked.querySelector("[data-testid=capture-banner]").textContent, /not a live scoreboard/i);
  const schools = [...ranked.querySelectorAll(".team .name")].map((node) => node.textContent);
  assert.equal(schools.length, 50);
  assert.equal(schools[0], "Miami Hurricanes");
  assert.match(ranked.textContent, /1–25 CFP/);
  assert.match(ranked.textContent, /Not a power ranking/);
  assert.match(ranked.textContent, /50 teams/);
  assert.equal(ranked.textContent.includes("FCS Coaches"), false);
  assert.equal(ranked.textContent.includes("0 pts"), false);
  assert.equal(ranked.querySelector("[data-testid=power-unavailable]"), null);
});

test("the games tab uses the NFL score lines", () => {
  const session = createSession();
  session.openTeamId = "333";
  session.teamTab = "games";
  const copy = structuredClone(capture);
  copy.games["2026"].games.push({
    providerId: "loss-only",
    season: 2026,
    week: 9,
    phase: "regular",
    startDate: "2026-10-31T23:30:00.000Z",
    status: "final",
    statusLabel: "Final",
    live: false,
    home: { providerId: "333", name: "Alabama Crimson Tide", abbreviation: "ALA", points: 10, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png" },
    away: { providerId: "61", name: "Georgia Bulldogs", abbreviation: "UGA", points: 17, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/61.png" },
  }, {
    providerId: "next-only",
    season: 2026,
    week: 12,
    phase: "regular",
    startDate: "2026-11-21T20:00:00.000Z",
    status: "scheduled",
    statusLabel: "Scheduled",
    live: false,
    home: { providerId: "333", name: "Alabama Crimson Tide", abbreviation: "ALA", points: null, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png" },
    away: { providerId: "99", name: "LSU Tigers", abbreviation: "LSU", points: null, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/99.png" },
  }, {
    providerId: "live-only",
    season: 2026,
    week: 11,
    phase: "regular",
    startDate: "2026-11-14T20:00:00.000Z",
    status: "in_progress",
    statusLabel: "2nd 8:21",
    live: true,
    clockLabel: "Q2 8:21",
    home: { providerId: "333", name: "Alabama Crimson Tide", abbreviation: "ALA", points: 7, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png" },
    away: { providerId: "26", name: "UCLA Bruins", abbreviation: "UCLA", points: 10, logo: "https://a.espncdn.com/i/teamlogos/ncaa/500/26.png" },
  });
  const root = mount(session, copy);
  assert.match(root.textContent, /COMPLETED REGULAR-SEASON GAMES/);
  assert.match(root.textContent, /UPCOMING REGULAR-SEASON GAMES/);
  assert.match(root.textContent, /IN PROGRESS/);
  const win = [...root.querySelectorAll(".completed-sec .game")].find((row) => row.textContent.includes("@ LSU Tigers"));
  assert.ok(win);
  assert.equal(win.querySelector(".loc").textContent, "AWAY");
  assert.equal(win.querySelector(".my-abbr").textContent, "ALA");
  assert.equal(win.querySelector(".my-pts").textContent, "31");
  assert.equal(win.querySelector(".result").textContent, "W");
  assert.equal(win.querySelector(".opp-abbr").textContent, "LSU");
  assert.equal(win.querySelector(".opp-pts").textContent, "13");
  assert.equal(win.querySelector(".result-pad").hidden, false);
  const loss = [...root.querySelectorAll(".completed-sec .game")].find((row) => row.textContent.includes("vs Georgia Bulldogs"));
  assert.equal(loss.querySelector(".loc").textContent, "HOME");
  assert.equal(loss.querySelector(".result").className, "result L");
  const logos = win.querySelectorAll(".score-logo");
  assert.equal(logos.length, 2);
  for (const logo of logos) {
    assert.equal(logo.getAttribute("loading"), "lazy");
    assert.equal(logo.getAttribute("width"), "15");
    assert.equal(logo.getAttribute("height"), "15");
    assert.match(logo.getAttribute("src"), /^https:\/\/a\.espncdn\.com\//);
  }
  const upcoming = root.querySelector(".upcoming-sec .game");
  assert.equal(upcoming.querySelector(".badge").textContent, "SCHEDULED");
  assert.equal(upcoming.querySelector(".scorebox").hidden, true);
  const live = root.querySelector(".live-sec .game");
  assert.match(live.className, /is-live/);
  assert.equal(live.querySelector(".badge").textContent, "● LIVE");
  assert.equal(live.querySelector(".result").hidden, true);
  assert.equal(live.querySelector(".clock").textContent, "Q2 8:21");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.game\.is-live \{[^}]*var\(--playing\)/);
  assert.match(css, /\.game\.is-live \.badge \{[^}]*var\(--playing\)/);
});

test("Alabama roster shows ESPN class and no starter tag", () => {
  const session = createSession();
  session.rankingView = "ap";
  session.openTeamId = "333";
  session.teamTab = "roster";
  const root = mount(session, capture);
  assert.match(root.textContent, /Freshman/);
  assert.match(root.textContent, /not labeled/);
  assert.equal(root.querySelector(".badge-starter"), null);
  assert.ok(root.querySelector("img.headshot"));
  assert.equal(root.querySelectorAll(".tabs .tab").length >= 3, true);
  session.teamTab = "stats";
  const stats = mount(session, capture);
  assert.match(stats.textContent, /ESPN returned no season stats for this team/);
});

test("an empty ESPN tab says so in one line", () => {
  const session = createSession();
  session.openTeamId = "333";
  session.teamTab = "games";
  const copy = structuredClone(capture);
  copy.teamSchedules = { "2026:333": { games: [], state: "empty", reason: "ESPN returned no games for this season." } };
  copy.rosters = { ...(copy.rosters || {}), "2026:333": { state: "no_data", players: [], reason: "ESPN returned no players for this season." } };
  const games = mount(session, copy);
  assert.match(games.textContent, /ESPN returned no games for this season/);
  session.teamTab = "roster";
  const roster = mount(session, copy);
  assert.match(roster.textContent, /ESPN returned no players for this season/);
});

test("live filter on a final capture does not invent a live game", () => {
  const session = createSession();
  session.rankingView = "ap";
  session.liveOnly = true;
  const root = mount(session, capture);
  assert.match(root.textContent, /No teams with an in-progress game/);
  assert.equal(root.querySelector("[data-live]"), null);
});

test("a schema-only in-progress row gets a conference stroke glow", () => {
  const session = createSession();
  session.rankingView = "ap";
  const copy = structuredClone(capture);
  copy.games["2026"].games.push({
    providerId: "schema-only",
    season: 2026,
    week: 10,
    phase: "regular",
    status: "in_progress",
    statusLabel: "2nd 8:21",
    live: true,
    clockLabel: "Q2 8:21",
    home: { providerId: "2390", name: "Miami Hurricanes", points: 10 },
    away: { providerId: "333", name: "Alabama Crimson Tide", points: 7 },
    kickoffLabel: "Schema only",
    neutralSite: false,
  });
  const root = mount(session, copy);
  const live = root.querySelector("[data-live=true]");
  assert.ok(live);
  assert.match(live.textContent, /Live/);
  assert.match(live.getAttribute("style") || "", /--stroke/);
  assert.equal(root.querySelector(".live-dot.on"), null);
});

test("reopen closes panels and returns filters to All without dropping the poll", () => {
  const session = createSession();
  session.rankingView = "cfp";
  session.conference = "Southeastern Conference";
  session.division = "Sun Belt - East";
  session.liveOnly = true;
  session.season = "2024";
  session.openTeamId = "333";
  session.teamTab = "roster";
  session.openPlayerId = "1";
  session.dialog = "settings";
  reopen(session);
  const root = mount(session, capture);
  assert.equal(session.rankingView, "cfp");
  assert.equal(session.season, "2024");
  assert.equal(session.conference, "all");
  assert.equal(session.division, "all");
  assert.equal(session.liveOnly, false);
  assert.equal(session.teamTab, "games");
  assert.equal(session.openTeamId, null);
  assert.equal(session.dialog, null);
  assert.equal(root.querySelector("#settings"), null);
  assert.equal(root.querySelector(".panel"), null);
});

test("the only list is the 50-team board, not a power ranking", () => {
  const session = createSession();
  const root = mount(session, capture);
  assert.equal(root.querySelectorAll(".team").length, 50);
  assert.match(root.textContent, /Not a power ranking/);
  assert.equal(root.querySelector("#conference"), null);
  assert.equal(root.querySelector("#poll-week"), null);
  assert.equal(root.querySelector("select"), null);
});

test("refresh keeps the open team", () => {
  const session = createSession();
  session.rankingView = "ap";
  session.openTeamId = "333";
  session.teamTab = "roster";
  const root = mount(session, capture);
  assert.ok(root.querySelector(".panel"));
  assert.equal(session.openTeamId, "333");
  assert.equal(session.teamTab, "roster");
});

test("synthetic fixtures are not the captured board", () => {
  const session = createSession();
  session.rankingView = "ap";
  const root = mount(session, synthetic);
  assert.match(root.textContent, /North Fixture/);
  assert.equal(root.querySelector("[data-testid=capture-banner]"), null);
});

test("shell uses the standings navy and red and does not call ESPN itself", () => {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(app, /ESPN was not contacted|does not contact ESPN|ESPN is not contacted/);
  assert.equal(app.includes("collegefootballdata.com"), false);
  assert.equal(app.includes("nfl-prefs"), false);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.equal(sw.includes("nfl-dashboard"), false);
  assert.match(css, /--nfl-navy:\s*#013369/);
  assert.match(css, /--nfl-red:\s*#D50A0A/);
  assert.match(css, /var\(--stroke/);
  assert.match(html, /FBS Board/);
  assert.equal(html.includes("free data plan"), false);
  const config = fs.readFileSync(new URL("../fbs-config.js", import.meta.url), "utf8");
  assert.match(config, /https:\/\/fbs-board-data\.josh-soudah\.workers\.dev/);
  assert.match(app, /hostname === "localhost"/);
});
