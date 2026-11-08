import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createTimedCache } from "../src/service/cache.js";
import { getView } from "../src/service/client.js";
import { createHandler } from "../src/service/handler.js";
import { parseTeamId } from "../src/service/validate.js";

function fixtureFetch() {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/standings")) {
      return Response.json({
        children: [{
          name: "Southeastern Conference",
          standings: { entries: [{ team: { id: "333", displayName: "Alabama Crimson Tide", abbreviation: "ALA" }, stats: [{ type: "total", name: "overall", displayValue: "7-2" }] }] },
        }, {
          name: "Sun Belt Conference",
          children: [
            { name: "Sun Belt - East", standings: { entries: [{ team: { id: "2", location: "East", name: "Sample" }, stats: [{ type: "total", name: "overall", displayValue: "1-0" }] }] } },
            { name: "Sun Belt - West", standings: { entries: [{ team: { id: "3", location: "West", name: "Sample" }, stats: [{ type: "total", name: "overall", displayValue: "0-1" }] }] } },
          ],
        }],
      });
    }
    if (parsed.pathname.endsWith("/rankings")) {
      const week = Number(parsed.searchParams.get("week"));
      return Response.json({
        requestedSeason: { year: Number(parsed.searchParams.get("seasons")), week: { number: week === 9 ? 10 : week } },
        rankings: [{
          type: "ap",
          name: "AP Top 25",
          occurrence: { number: week === 9 ? 10 : week },
          date: "2026-11-01T07:00Z",
          ranks: [{ current: 1, previous: 1, points: 1500, firstPlaceVotes: 10, trend: "-", team: { id: "333", location: "Alabama", name: "Crimson Tide" }, recordSummary: "7-2" }],
        }],
      });
    }
    if (parsed.pathname.endsWith("/scoreboard")) {
      return Response.json({
        season: { year: 2026, type: 2 },
        week: { number: 10 },
        events: [{
          id: "401",
          date: "2026-11-07T23:00:00Z",
          season: { year: 2026, type: 2 },
          week: { number: 10 },
          competitions: [{
            neutralSite: false,
            status: { displayClock: "0:00", period: 4, type: { name: "STATUS_FINAL", state: "post", completed: true, shortDetail: "Final" } },
            competitors: [
              { homeAway: "home", score: "24", team: { id: "333", location: "Alabama", name: "Crimson Tide" } },
              { homeAway: "away", score: "10", team: { id: "2", location: "East", name: "Sample" } },
            ],
          }],
        }],
      });
    }
    if (parsed.pathname.endsWith("/roster")) {
      return Response.json({
        season: { year: Number(parsed.searchParams.get("season")) },
        team: { id: "333", location: "Alabama", name: "Crimson Tide" },
        athletes: [{ position: "offense", items: [{ id: "9", firstName: "Ada", lastName: "Sample", jersey: "12", position: { abbreviation: "QB" }, experience: { displayValue: "Freshman" }, height: 75, weight: 210, injuries: [] }] }],
      });
    }
    if (parsed.pathname.endsWith("/statistics")) {
      return Response.json({ season: { year: 2026 }, requestedSeason: { year: Number(parsed.searchParams.get("season")) } });
    }
    return new Response("no", { status: 404 });
  };
}

function app() {
  return createHandler({
    fetch: fixtureFetch(),
    cache: createTimedCache({ now: () => 0 }),
    allowedOrigin: "https://joshuasoudah.github.io",
    now: () => new Date("2026-11-08T17:21:00Z"),
  });
}

test("team ids are not capped at 34", () => {
  assert.equal(parseTeamId("34"), "34");
  assert.equal(parseTeamId("333"), "333");
  assert.equal(parseTeamId("1000000"), null);
  assert.equal(parseTeamId("abc"), null);
});

test("normalized board, roster, and a mismatched stat stay honest", async () => {
  const handle = app();
  const board = await handle(new Request("http://fbs.local/v1/board?season=2026&week=10&seasontype=2"));
  const body = await board.json();
  assert.equal(board.status, 200);
  assert.equal(body.source, "fbs-board-service");
  assert.equal(body.synthetic, false);
  assert.equal(body.memberships["2026"].count, 3);
  assert.equal(body.polls["2026"]["10"].families.ap.ranks[0].school, "Alabama Crimson Tide");
  assert.equal(body.games["2026"].games[0].live, false);
  assert.equal(body.liveClockObserved, false);
  assert.equal(body.capabilities.powerRankingsDisplay, "unavailable");

  const roster = await handle(new Request("http://fbs.local/v1/roster?team=34&season=2026"));
  const rosterBody = await roster.json();
  assert.equal(roster.status, 200);
  assert.equal(rosterBody.players[0].classLabel, "Freshman");
  assert.equal(rosterBody.starters, null);

  const stats = await handle(new Request("http://fbs.local/v1/stats?team=333&season=2025"));
  const statsBody = await stats.json();
  assert.equal(statsBody.state, "season_mismatch");
  assert.equal(statsBody.stats.length, 0);
});

test("CORS preflight, bad origin, bad query, and raw proxy are refused", async () => {
  const handle = app();
  const preflight = await handle(new Request("http://fbs.local/v1/board?season=2026&week=10", {
    method: "OPTIONS",
    headers: { Origin: "https://joshuasoudah.github.io" },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://joshuasoudah.github.io");

  const foreign = await handle(new Request("http://fbs.local/v1/board?season=2026&week=10", {
    headers: { Origin: "https://example.com" },
  }));
  assert.equal(foreign.status, 403);

  const bad = await handle(new Request("http://fbs.local/v1/board?season=1800&week=10"));
  assert.equal(bad.status, 400);
  const proxy = await handle(new Request("http://fbs.local/v1/scoreboard?url=https://evil.example/secret"));
  assert.equal(proxy.status, 403);
  const week9 = await handle(new Request("http://fbs.local/v1/rankings?season=2026&week=9"));
  const echoed = await week9.json();
  assert.equal(echoed.state, "wrong_week");
});

test("a failed refresh serves the last good view and a hit does not refetch", async () => {
  let calls = 0;
  let fail = false;
  const cache = createTimedCache({ now: () => 0 });
  const handle = createHandler({
    cache,
    now: () => new Date("2026-11-08T17:21:00Z"),
    fetch: async (url) => {
      calls += 1;
      if (fail) return new Response("no", { status: 503 });
      return fixtureFetch()(url);
    },
  });
  const first = await handle(new Request("http://fbs.local/v1/membership?season=2026"));
  const firstBody = await first.json();
  assert.equal(firstBody.count, 3);
  const before = calls;
  const second = await handle(new Request("http://fbs.local/v1/membership?season=2026"));
  const secondBody = await second.json();
  assert.equal(secondBody.cache, "hit");
  assert.equal(calls, before);
  fail = true;
  const expired = createTimedCache({ now: () => 10_000_000_000 });
  await expired.put("https://fbs-board.cache/last/membership:2026", new Response(JSON.stringify(firstBody)), null);
  const staleHandler = createHandler({
    cache: expired,
    fetch: async () => new Response("no", { status: 503 }),
    now: () => new Date("2026-11-08T18:00:00Z"),
  });
  const stale = await staleHandler(new Request("http://fbs.local/v1/membership?season=2026"));
  const staleBody = await stale.json();
  assert.equal(stale.status, 200);
  assert.equal(staleBody.stale, true);
  assert.equal(staleBody.count, 3);
});

test("the browser client reads a local normalized route", async () => {
  const handle = app();
  const server = http.createServer(async (req, res) => {
    const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const result = await getView(`http://127.0.0.1:${port}`, "v1/board", { season: 2026, week: 10, seasontype: 2 });
    assert.equal(result.ok, true);
    assert.equal(result.body.games["2026"].games[0].home.points, 24);
    assert.equal(result.body.games["2026"].games[0].away.points, 10);
  } finally {
    server.close();
  }
});
