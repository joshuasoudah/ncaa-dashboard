import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseHTML } from "linkedom";
import { buildSnapshot } from "../src/normalize/snapshot.js";
import { createSession, reopen } from "../src/ui/session.js";
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

test("disconnected shell matches the standings toolbar and invents no teams", () => {
  const root = mount(createSession(), null);
  const text = root.textContent;
  assert.match(text, /FBS Board/);
  assert.match(text, /Not connected/);
  assert.match(text, /does not contact ESPN/);
  assert.match(text, /Power rankings are not available/);
  assert.equal(text.includes("Miami Hurricanes"), false);
  assert.equal(text.includes("North Fixture"), false);
  assert.equal(root.querySelector("#refresh").textContent, "Refresh now");
  assert.equal(root.querySelector("#settings-open").textContent, "Settings");
  assert.equal(root.querySelector("#live-only").getAttribute("aria-pressed"), "false");
  assert.equal(root.querySelector("[data-live], .live-pill, .live-dot.on"), null);
  assert.equal(root.querySelector("input[type=search]"), null);
});

test("captured polls show 25 real teams, receiving votes, and no power ranks", () => {
  const session = createSession();
  const power = mount(session, capture);
  assert.match(power.querySelector("[data-testid=capture-banner]").textContent, /not a live scoreboard/i);
  assert.equal(power.textContent.includes("Miami Hurricanes"), false);
  session.rankingView = "ap";
  const ranked = mount(session, capture);
  assert.match(ranked.textContent, /Miami Hurricanes/);
  assert.match(ranked.textContent, /Showing 25 of 25/);
  assert.match(ranked.textContent, /Others receiving votes/);
  assert.match(ranked.textContent, /previous 1/);
  assert.equal(ranked.textContent.includes("FCS Coaches"), false);
  session.rankingView = "cfp";
  const cfp = mount(session, capture);
  assert.match(cfp.textContent, /previous not ranked/);
  assert.equal(cfp.textContent.includes("0 pts"), false);
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
  assert.match(stats.textContent, /withheld/);
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

test("the FBS list is every stored team sorted by record, not a power ranking", () => {
  const session = createSession();
  session.rankingView = "fbs";
  const root = mount(session, capture);
  assert.match(root.textContent, /Showing 138 of 138/);
  assert.match(root.textContent, /not a power ranking/);
  assert.equal(root.querySelector("[data-testid=power-unavailable]"), null);
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
