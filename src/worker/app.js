import { createTtlCache } from "../espn/cache.js";
import { normalizeRankings, normalizeRoster, normalizeScoreboard, collectMembership } from "../espn/normalize.js";
import { assertEspnUrl, rankingsUrl, rosterUrl, scoreboardUrl, standingsUrl } from "../espn/urls.js";
import { disconnectedSnapshot } from "../normalize/snapshot.js";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function cachedGet(cache, key, url, transport) {
  assertEspnUrl(url);
  return cache.get(key, async () => {
    const response = await transport(url.toString());
    return { status: response.status, body: response.body };
  });
}

/**
 * Normalizing worker source. Not deployed.
 * The browser asks for these views. It cannot pass an arbitrary ESPN URL.
 */
export function createCompanionApp({
  transport = async () => {
    throw new Error("transport_not_configured");
  },
  cache = createTtlCache({ ttlMs: 15000 }),
  allowUpstream = false,
  now = () => Date.now(),
} = {}) {
  return async function handle(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith("/espn") || path.startsWith("/cfbd") || url.searchParams.has("url")) {
      return json(403, { error: "raw_provider_proxy_forbidden", upstreamCalled: false });
    }
    if (path === "/v1/capabilities" && request.method === "GET") {
      return json(200, {
        provider: "espn",
        upstreamEnabled: allowUpstream === true,
        liveClockObserved: false,
        durableQuota: false,
        cache: "process-local-ttl",
        upstreamCalled: false,
      });
    }
    if (path === "/v1/snapshot/reload" && request.method === "POST") {
      return json(200, {
        upstreamCalled: false,
        notice: "Reload does not call ESPN. A connected service would read its short cache.",
        snapshot: disconnectedSnapshot(),
      });
    }
    if (!allowUpstream) {
      if (path.startsWith("/v1/")) {
        return json(409, { error: "upstream_disabled", upstreamCalled: false, now: now() });
      }
      return json(404, { error: "not_found", upstreamCalled: false });
    }

    if (path === "/v1/scoreboard" && request.method === "GET") {
      const target = scoreboardUrl({
        season: url.searchParams.get("season"),
        week: url.searchParams.get("week"),
        seasontype: url.searchParams.get("seasontype") || 2,
        dates: url.searchParams.get("dates"),
      });
      const result = await cachedGet(cache, `scoreboard:${target.search}`, target, transport);
      const view = result.value.status === 200
        ? normalizeScoreboard(result.value.body, { requestedSeason: Number(url.searchParams.get("season")) || null })
        : { state: "error", games: [] };
      return json(result.value.status === 200 ? 200 : 502, { ...view, cache: result.cache, upstreamCalls: result.upstreamCalls, durableQuota: false });
    }

    if (path === "/v1/membership" && request.method === "GET") {
      const season = Number(url.searchParams.get("season"));
      const target = standingsUrl(season);
      const result = await cachedGet(cache, `standings:${season}`, target, transport);
      const view = result.value.status === 200 ? collectMembership(result.value.body, { requestedSeason: season }) : { state: "error", teams: [] };
      return json(result.value.status === 200 ? 200 : 502, { ...view, cache: result.cache, upstreamCalls: result.upstreamCalls });
    }

    if (path === "/v1/rankings" && request.method === "GET") {
      const season = Number(url.searchParams.get("season"));
      const week = Number(url.searchParams.get("week"));
      const target = rankingsUrl({ season, week, seasontype: url.searchParams.get("seasontype") || 2 });
      const result = await cachedGet(cache, `rankings:${season}:${week}`, target, transport);
      const view = result.value.status === 200
        ? normalizeRankings(result.value.body, { requestedSeason: season, requestedWeek: week })
        : { state: "error" };
      return json(result.value.status === 200 ? 200 : 502, { ...view, cache: result.cache, upstreamCalls: result.upstreamCalls });
    }

    if (path === "/v1/roster" && request.method === "GET") {
      const team = url.searchParams.get("team");
      const season = Number(url.searchParams.get("season"));
      const target = rosterUrl(team, season);
      const result = await cachedGet(cache, `roster:${team}:${season}`, target, transport);
      const view = result.value.status === 200 ? normalizeRoster(result.value.body, { requestedSeason: season, teamId: team }) : { state: "error", players: [] };
      return json(result.value.status === 200 ? 200 : 502, { ...view, cache: result.cache, upstreamCalls: result.upstreamCalls });
    }

    return json(404, { error: "not_found", upstreamCalled: false });
  };
}
