import { CONTRACT_VERSION, DEFAULT_SEASON } from "../config.js";
import { normalizeMembership } from "./membership.js";
import { normalizeGames, recordFromGames } from "./games.js";
import { normalizePollWeek } from "./polls.js";
import { normalizeRoster } from "./roster.js";
import { normalizePlayerSeasonStats, normalizeTeamSeasonStats } from "./stats.js";

export const CAPABILITIES = Object.freeze({
  liveScoreboard: false,
  livePlayByPlay: false,
  graphQl: false,
  adjustedMetrics: false,
  weather: false,
  rosterClass: false,
  headshots: false,
  verifiedStarters: false,
  injuries: false,
  eligibility: false,
  pollReleaseDate: false,
  pollMovement: false,
  receivingVotes: false,
  powerRankingsDisplay: "unavailable",
  powerWeightsApproved: false,
  teamSeasonStatsIncludePostseason: true,
  teamSeasonStatsSeasonTypeFilter: false,
});

/**
 * Build the only view the UI is allowed to render.
 * Raw provider payloads are not copied through.
 */
export function buildSnapshot(input) {
  const fetchedAt = input.fetchedAt ?? null;
  const synthetic = input.synthetic === true;
  const memberships = {};
  for (const [season, block] of Object.entries(input.membership ?? {})) {
    const year = Number(season);
    memberships[year] = normalizeMembership(block.teams ?? block, {
      requestedSeason: year,
      coverage: block.coverage ?? input.coverage ?? "partial",
    });
  }

  const games = {};
  for (const [season, block] of Object.entries(input.games ?? {})) {
    const year = Number(season);
    games[year] = normalizeGames(block.games ?? block, {
      requestedSeason: year,
      coverage: block.coverage ?? input.coverage ?? "partial",
    });
  }

  const polls = {};
  for (const week of input.rankings ?? []) {
    const raw = week.raw ?? week;
    const normalized = normalizePollWeek(raw, {
      fetchedAt: week.fetchedAt ?? fetchedAt,
    });
    if (normalized.state === "no_data" || normalized.season == null || normalized.week == null) continue;
    polls[normalized.season] ??= {};
    polls[normalized.season][normalized.week] = normalized;
  }

  const rosters = {};
  for (const roster of input.rosters ?? []) {
    const normalized = normalizeRoster(roster.players, {
      requestedSeason: roster.season,
      school: roster.school,
      coverage: roster.coverage ?? "partial",
    });
    rosters[`${roster.season}:${roster.school}`] = normalized;
  }

  const teamStats = {};
  for (const block of input.teamStats ?? []) {
    const normalized = normalizeTeamSeasonStats(block.rows, {
      requestedSeason: block.season,
      school: block.school,
      coverage: block.coverage ?? "partial",
      seasonType: null,
    });
    teamStats[`${block.season}:${block.school}`] = normalized;
  }

  const playerStats = {};
  for (const block of input.playerStats ?? []) {
    const normalized = normalizePlayerSeasonStats(block.rows, {
      requestedSeason: block.season,
      school: block.school,
      category: block.category ?? null,
      seasonType: block.seasonType ?? null,
      coverage: block.coverage ?? "partial",
    });
    const key = `${block.season}:${block.school}:${block.category || "all"}`;
    playerStats[key] = normalized;
  }

  const seasons = [...new Set([
    ...Object.keys(memberships),
    ...Object.keys(games),
    ...Object.keys(polls),
  ].map(Number))].sort((a, b) => b - a);

  return {
    contractVersion: CONTRACT_VERSION,
    fixtureClass: synthetic ? "test-only-synthetic" : null,
    synthetic,
    source: synthetic ? "test-only-synthetic" : "normalized-server-snapshot",
    provider: "cfbd",
    state: input.state ?? "fresh_snapshot",
    staleReason: input.staleReason ?? null,
    fetchedAt,
    sourcePublicationDate: null,
    asOfCutoff: null,
    defaultSeason: seasons.includes(DEFAULT_SEASON) ? DEFAULT_SEASON : (seasons[0] ?? null),
    seasons,
    capabilities: CAPABILITIES,
    quotaEnforcement: "none",
    durableQuota: false,
    memberships,
    games,
    polls,
    rosters,
    teamStats,
    playerStats,
    notices: input.notices ?? [],
  };
}

export function disconnectedSnapshot() {
  return {
    contractVersion: CONTRACT_VERSION,
    fixtureClass: null,
    synthetic: false,
    source: "none",
    provider: "cfbd",
    state: "disconnected",
    staleReason: null,
    fetchedAt: null,
    sourcePublicationDate: null,
    asOfCutoff: null,
    defaultSeason: DEFAULT_SEASON,
    seasons: [],
    capabilities: CAPABILITIES,
    quotaEnforcement: "none",
    durableQuota: false,
    memberships: {},
    games: {},
    polls: {},
    rosters: {},
    teamStats: {},
    playerStats: {},
    notices: ["No snapshot is stored. The screen does not invent teams, scores, or ranks."],
  };
}

export function teamRecord(snapshot, season, providerId) {
  const games = snapshot?.games?.[season]?.games ?? null;
  if (!games) return recordFromGames(providerId, null);
  return recordFromGames(providerId, games);
}

export function acceptRenderable(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "missing" };
  }
  if (payload.synthetic === true && payload.fixtureClass === "test-only-synthetic") {
    return { ok: true, mode: "test" };
  }
  if (payload.synthetic === false && payload.fixtureClass === "public-espn-capture" && payload.provider === "espn") {
    return { ok: true, mode: "capture" };
  }
  if (payload.synthetic === false && payload.source === "normalized-server-snapshot" && payload.state) {
    return { ok: true, mode: "server" };
  }
  if (payload.state === "disconnected") return { ok: true, mode: "disconnected" };
  return { ok: false, reason: "unlabeled_payload" };
}
