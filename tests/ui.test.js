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
  renderApp(root, { session, snapshot: data, theme: "dark", reduceMotion: true, autoRefresh: true, status: "", ...extra });
  return root;
}

test("disconnected shell has no invented teams or a live glow", () => {
  const root = mount(createSession(), null);
  const text = root.textContent;
  assert.match(text, /Not connected/);
  assert.match(text, /does not call ESPN/);
  assert.match(text, /Power rankings unavailable/);
  assert.equal(text.includes("Alabama"), false);
  assert.equal(text.includes("Miami Hurricanes"), false);
  assert.equal(text.includes("North Fixture"), false);
  assert.equal(root.querySelector("[data-live], .live-dot, .live-pill"), null);
  assert.equal(root.querySelector("#live-only").textContent, "Live now");
  assert.equal(root.querySelector("input[type=search]"), null);
});

test("captured polls show 25 real teams, receiving votes, and no power ranks", () => {
  const session = createSession();
  const power = mount(session, capture);
  assert.match(power.querySelector("[data-testid=capture-banner]").textContent, /Not a live connection/);
  assert.match(power.textContent, /not approved/i);
  assert.equal(power.textContent.includes("Miami Hurricanes"), false);
  session.rankingView = "ap";
  const ranked = mount(session, capture);
  assert.match(ranked.textContent, /Miami Hurricanes/);
  assert.match(ranked.textContent, /25 returned ranks/);
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
  assert.match(root.textContent, /No starter designation/);
  assert.equal(root.textContent.includes("Starter"), false);
  assert.ok(root.querySelector("img.headshot"));
  session.teamTab = "stats";
  const stats = mount(session, capture);
  assert.match(stats.textContent, /withheld/);
});

test("live filter on a final capture does not invent a live game", () => {
  const session = createSession();
  session.mainTab = "games";
  session.liveOnly = true;
  const root = mount(session, capture);
  assert.match(root.textContent, /No in-progress games/);
  assert.equal(root.querySelector("[data-live]"), null);
  assert.match(root.textContent, /final/i);
});

test("a schema-only in-progress row gets a conference glow and LIVE label", () => {
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
  copy.games["2026"].liveCount = 1;
  const root = mount(session, copy);
  const live = root.querySelector("[data-live=true]");
  assert.ok(live);
  assert.match(live.textContent, /LIVE/);
  assert.match(live.getAttribute("style") || "", /--stroke/);
});

test("reopen closes panels and restores rankings, games, and all conferences", () => {
  const session = createSession();
  session.mainTab = "games";
  session.rankingView = "cfp";
  session.conference = "Southeastern Conference";
  session.liveOnly = true;
  session.season = "2024";
  session.openTeamId = "333";
  session.teamTab = "roster";
  session.openPlayerId = "1";
  session.dialog = "methodology";
  reopen(session);
  const root = mount(session, capture);
  assert.equal(session.mainTab, "rankings");
  assert.equal(session.rankingView, "power");
  assert.equal(session.conference, "all");
  assert.equal(session.liveOnly, false);
  assert.equal(session.teamTab, "games");
  assert.equal(session.openTeamId, null);
  assert.equal(session.dialog, null);
  assert.equal(root.querySelector("[role=dialog]"), null);
  assert.equal(root.querySelector(".panel"), null);
});

test("synthetic fixtures stay labeled and are not the captured board", () => {
  const session = createSession();
  session.rankingView = "ap";
  const root = mount(session, synthetic);
  assert.match(root.querySelector("[data-testid=test-banner]").textContent, /synthetic fixtures/i);
  assert.equal(root.querySelector("[data-testid=capture-banner]"), null);
});

test("shell files do not call ESPN from the static page or delete other caches", () => {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(app, /ESPN was not contacted|does not contact ESPN|ESPN is not contacted/);
  assert.equal(app.includes("collegefootballdata.com"), false);
  assert.equal(app.includes("nfl-prefs"), false);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.equal(sw.includes("nfl"), false);
  assert.match(css, /data-live/);
  assert.equal(css.includes("live-dot"), false);
  assert.match(html, /Not connected/);
  assert.equal(html.includes("free data plan"), false);
});
