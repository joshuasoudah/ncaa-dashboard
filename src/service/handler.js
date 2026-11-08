import { collectMembership, normalizeRankings, normalizeRoster, normalizeSchedule, normalizeScoreboard, normalizeTeamStatistics } from "../espn/normalize.js";
import { rankingsUrl, rosterUrl, scheduleUrl, scoreboardUrl, standingsUrl, statisticsUrl } from "../espn/urls.js";
import { readThrough } from "./cache.js";
import { parseSeason, parseSeasonType, parseTeamId, parseWeek } from "./validate.js";

export const TTL = Object.freeze({
  scoreboard: 15,
  rankings: 6 * 60 * 60,
  membership: 24 * 60 * 60,
  roster: 2 * 60 * 60,
  stats: 30 * 60,
  schedule: 6 * 60 * 60,
});

const inflightBoard = new Map();

function json(body, status, corsHeaders, cacheSeconds) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheSeconds ? `public, max-age=${cacheSeconds}` : "no-store",
    ...corsHeaders,
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function corsFor(request, allowedOrigin) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (!origin) return { ok: true, headers };
  if (allowedOrigin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    return { ok: true, headers };
  }
  return { ok: false, headers };
}

async function espnJson(fetchImpl, target, ttlSeconds) {
  const response = await fetchImpl(target.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cf: { cacheTtl: ttlSeconds, cacheEverything: true },
  });
  if (!response.ok) return { ok: false, status: response.status, body: null };
  return { ok: true, status: 200, body: await response.json() };
}

function notice(parts) {
  return parts.filter(Boolean);
}

export function createHandler({
  fetch: fetchImpl = globalThis.fetch,
  cache,
  allowedOrigin = "",
  now = () => new Date(),
} = {}) {
  if (!cache) throw new Error("cache is required");

  async function loadMembership(season) {
    const key = `membership:${season}`;
    return readThrough(cache, key, TTL.membership, async () => {
      const loaded = await espnJson(fetchImpl, standingsUrl(season), TTL.membership);
      if (!loaded.ok) return loaded;
      return { ok: true, body: collectMembership(loaded.body, { requestedSeason: season }) };
    });
  }

  async function loadRankings(season, week, seasontype) {
    const key = `rankings:${season}:${week}:${seasontype}`;
    return readThrough(cache, key, TTL.rankings, async () => {
      const loaded = await espnJson(fetchImpl, rankingsUrl({ season, week, seasontype }), TTL.rankings);
      if (!loaded.ok) return loaded;
      return { ok: true, body: normalizeRankings(loaded.body, { requestedSeason: season, requestedWeek: week, fetchedAt: now().toISOString() }) };
    });
  }

  async function loadScoreboard(season, week, seasontype) {
    const key = `scoreboard:${season}:${week}:${seasontype}`;
    return readThrough(cache, key, TTL.scoreboard, async () => {
      const loaded = await espnJson(fetchImpl, scoreboardUrl({ season, week, seasontype }), TTL.scoreboard);
      if (!loaded.ok) return loaded;
      return { ok: true, body: normalizeScoreboard(loaded.body, { requestedSeason: season, fetchedAt: now().toISOString() }) };
    });
  }

  async function board(season, week, seasontype) {
    const key = `${season}:${week}:${seasontype}`;
    if (inflightBoard.has(key)) return inflightBoard.get(key);
    const job = (async () => {
      const [membership, rankings, scoreboard] = await Promise.all([
        loadMembership(season),
        loadRankings(season, week, seasontype),
        loadScoreboard(season, week, seasontype),
      ]);
      const stale = [membership, rankings, scoreboard].some((part) => part.stale);
      const failed = [membership, rankings, scoreboard].filter((part) => !part.body);
      if (failed.length === 3) {
        return { status: 502, body: { error: "upstream_unavailable", source: "fbs-board-service", state: "error" } };
      }
      const body = {
        contractVersion: 1,
        fixtureClass: null,
        synthetic: false,
        source: "fbs-board-service",
        provider: "espn",
        state: stale || failed.length ? "stale_snapshot" : "fresh_snapshot",
        staleReason: stale ? "At least one ESPN read failed. The last good section is shown." : null,
        fetchedAt: now().toISOString(),
        liveClockObserved: false,
        liveSchema: true,
        defaultSeason: season,
        seasons: [season],
        capabilities: {
          liveScoreboardSchema: true,
          liveClockObserved: false,
          verifiedStarters: false,
          powerRankingsDisplay: "unavailable",
          powerWeightsApproved: false,
        },
        durableQuota: false,
        quotaEnforcement: "none",
        memberships: membership.body ? { [season]: membership.body } : {},
        games: scoreboard.body ? { [season]: scoreboard.body } : {},
        polls: rankings.body?.week ? { [season]: { [rankings.body.week]: rankings.body } } : {},
        rosters: {},
        teamStats: {},
        playerStats: {},
        notices: notice([
          failed.length ? "Part of this refresh did not arrive. Missing sections were not filled with another season." : "",
          "No live clock is promised. A game is in progress only when ESPN marks that status.",
          "Sorted FBS rows are membership records, not power rankings.",
        ]),
        cache: { membership: membership.cache, rankings: rankings.cache, scoreboard: scoreboard.cache },
        upstreamCalls: membership.upstreamCalls + rankings.upstreamCalls + scoreboard.upstreamCalls,
      };
      return { status: 200, body };
    })();
    inflightBoard.set(key, job);
    try {
      return await job;
    } finally {
      inflightBoard.delete(key);
    }
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const cors = corsFor(request, allowedOrigin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    }
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, cors.headers);
    }
    if (!cors.ok) return json({ error: "origin_not_allowed" }, 403, cors.headers);
    if (url.searchParams.has("url") || url.pathname.startsWith("/espn") || url.pathname.includes("collegefootballdata")) {
      return json({ error: "raw_provider_proxy_forbidden", upstreamCalled: false }, 403, cors.headers);
    }

    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/v1/capabilities") {
      return json({
        provider: "espn",
        service: "fbs-board",
        durableQuota: false,
        liveClockObserved: false,
        cache: "shared-public-get",
        note: "CORS allows one configured origin. It is not authentication. Cache hits still count as Worker requests and do not meter the account's daily limit.",
        endpoints: ["/v1/board", "/v1/membership", "/v1/rankings", "/v1/scoreboard", "/v1/roster", "/v1/stats", "/v1/schedule"],
      }, 200, cors.headers, 60);
    }

    const season = parseSeason(url.searchParams.get("season"));
    const week = parseWeek(url.searchParams.get("week"));
    const seasontype = parseSeasonType(url.searchParams.get("seasontype"), 2);
    const team = parseTeamId(url.searchParams.get("team"));

    if (path === "/v1/board") {
      if (!season || !week || !seasontype) return json({ error: "invalid_query" }, 400, cors.headers);
      const result = await board(season, week, seasontype);
      return json(result.body, result.status, cors.headers, result.body?.state === "fresh_snapshot" ? TTL.scoreboard : 0);
    }
    if (path === "/v1/membership") {
      if (!season) return json({ error: "invalid_query" }, 400, cors.headers);
      const result = await loadMembership(season);
      if (!result.body) return json({ error: "upstream_unavailable", cache: result.cache }, result.errorStatus || 502, cors.headers);
      return json({ ...result.body, cache: result.cache, stale: result.stale === true, upstreamCalls: result.upstreamCalls }, 200, cors.headers, result.stale ? 0 : TTL.membership);
    }
    if (path === "/v1/rankings") {
      if (!season || !week || !seasontype) return json({ error: "invalid_query" }, 400, cors.headers);
      const result = await loadRankings(season, week, seasontype);
      if (!result.body) return json({ error: "upstream_unavailable" }, result.errorStatus || 502, cors.headers);
      return json({ ...result.body, cache: result.cache, stale: result.stale === true }, 200, cors.headers, result.stale ? 0 : TTL.rankings);
    }
    if (path === "/v1/scoreboard") {
      if (!season || !week || !seasontype) return json({ error: "invalid_query" }, 400, cors.headers);
      const result = await loadScoreboard(season, week, seasontype);
      if (!result.body) return json({ error: "upstream_unavailable" }, result.errorStatus || 502, cors.headers);
      return json({ ...result.body, cache: result.cache, stale: result.stale === true }, 200, cors.headers, result.stale ? 0 : TTL.scoreboard);
    }
    if (path === "/v1/roster" || path === "/v1/stats" || path === "/v1/schedule") {
      if (!season || !team || (path !== "/v1/roster" && !seasontype && path === "/v1/schedule")) {
        return json({ error: "invalid_query" }, 400, cors.headers);
      }
      if (!team) return json({ error: "invalid_team" }, 400, cors.headers);
    }
    if (path === "/v1/roster") {
      if (!season || !team) return json({ error: "invalid_query" }, 400, cors.headers);
      const result = await readThrough(cache, `roster:${team}:${season}`, TTL.roster, async () => {
        const loaded = await espnJson(fetchImpl, rosterUrl(team, season), TTL.roster);
        if (!loaded.ok) return loaded;
        return { ok: true, body: normalizeRoster(loaded.body, { requestedSeason: season, teamId: team }) };
      });
      if (!result.body) return json({ error: "upstream_unavailable" }, result.errorStatus || 502, cors.headers);
      return json({ ...result.body, cache: result.cache, stale: result.stale === true }, 200, cors.headers, result.stale ? 0 : TTL.roster);
    }
    if (path === "/v1/stats") {
      if (!season || !team) return json({ error: "invalid_query" }, 400, cors.headers);
      const result = await readThrough(cache, `stats:${team}:${season}`, TTL.stats, async () => {
        const loaded = await espnJson(fetchImpl, statisticsUrl(team, season), TTL.stats);
        if (!loaded.ok) return loaded;
        return { ok: true, body: normalizeTeamStatistics(loaded.body, { requestedSeason: season, teamId: team }) };
      });
      if (!result.body) return json({ error: "upstream_unavailable" }, result.errorStatus || 502, cors.headers);
      return json({ ...result.body, cache: result.cache, stale: result.stale === true }, 200, cors.headers, result.stale ? 0 : TTL.stats);
    }
    if (path === "/v1/schedule") {
      if (!season || !team || !seasontype) return json({ error: "invalid_query" }, 400, cors.headers);
      const result = await readThrough(cache, `schedule:${team}:${season}:${seasontype}`, TTL.schedule, async () => {
        const loaded = await espnJson(fetchImpl, scheduleUrl(team, { season, seasontype }), TTL.schedule);
        if (!loaded.ok) return loaded;
        return { ok: true, body: normalizeSchedule(loaded.body, { requestedSeason: season, seasonType: seasontype }) };
      });
      if (!result.body) return json({ error: "upstream_unavailable" }, result.errorStatus || 502, cors.headers);
      return json({ ...result.body, cache: result.cache, stale: result.stale === true }, 200, cors.headers, result.stale ? 0 : TTL.schedule);
    }
    return json({ error: "not_found" }, 404, cors.headers);
  };
}
