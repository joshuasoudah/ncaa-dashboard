import test from "node:test";
import assert from "node:assert/strict";
import { createTtlCache } from "../src/espn/cache.js";
import { createCompanionApp } from "../src/worker/app.js";

test("reload and raw paths never call ESPN", async () => {
  let calls = 0;
  const app = createCompanionApp({
    allowUpstream: true,
    transport: async () => {
      calls += 1;
      throw new Error("should not run");
    },
  });
  const reload = await app(new Request("http://draft.local/v1/snapshot/reload", { method: "POST" }));
  const body = await reload.json();
  assert.equal(body.upstreamCalled, false);
  const proxy = await app(new Request("http://draft.local/espn?url=https://site.api.espn.com/scoreboard"));
  assert.equal(proxy.status, 403);
  assert.equal(calls, 0);
});

test("upstream stays disabled unless a test turns it on", async () => {
  let calls = 0;
  const app = createCompanionApp({
    transport: async () => {
      calls += 1;
      return { status: 200, body: {} };
    },
  });
  const blocked = await app(new Request("http://draft.local/v1/scoreboard?season=2026&week=10"));
  const body = await blocked.json();
  assert.equal(blocked.status, 409);
  assert.equal(body.error, "upstream_disabled");
  assert.equal(calls, 0);
});

test("enabled scoreboard reads are cached and normalized", async () => {
  let calls = 0;
  const app = createCompanionApp({
    allowUpstream: true,
    cache: createTtlCache({ ttlMs: 15000, now: () => 0 }),
    transport: async (url) => {
      calls += 1;
      assert.match(url, /^https:\/\/site\.api\.espn\.com\//);
      return {
        status: 200,
        body: {
          season: { year: 2026 },
          week: { number: 10 },
          events: [{
            id: "1",
            date: "2026-11-07T20:00:00Z",
            season: { year: 2026, type: 2 },
            week: { number: 10 },
            competitions: [{
              neutralSite: false,
              status: { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" } },
              competitors: [
                { homeAway: "home", score: "21", team: { id: "10", location: "Home", name: "Team" } },
                { homeAway: "away", score: "14", team: { id: "11", location: "Away", name: "Team" } },
              ],
            }],
          }],
        },
      };
    },
  });
  const first = await app(new Request("http://draft.local/v1/scoreboard?season=2026&week=10"));
  const second = await app(new Request("http://draft.local/v1/scoreboard?season=2026&week=10"));
  const a = await first.json();
  const b = await second.json();
  assert.equal(calls, 1);
  assert.equal(a.games[0].live, false);
  assert.equal(a.games[0].home.points, 21);
  assert.equal(b.cache, "hit");
  assert.equal(b.upstreamCalls, 0);
});

test("roster route keeps an empty historical roster empty", async () => {
  const app = createCompanionApp({
    allowUpstream: true,
    transport: async () => ({
      status: 200,
      body: { season: { year: 2025 }, team: { id: "333", location: "Alabama", name: "Crimson Tide" }, athletes: [{ position: "offense", items: [] }] },
    }),
  });
  const response = await app(new Request("http://draft.local/v1/roster?team=333&season=2025"));
  const body = await response.json();
  assert.equal(body.state, "no_data");
  assert.equal(body.players.length, 0);
});
