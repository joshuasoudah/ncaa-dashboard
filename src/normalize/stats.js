import { interpretStat, nullableText } from "./common.js";

export const TEAM_SEASON_SCOPE = {
  includesPostseason: true,
  seasonTypeFilter: false,
  label: "Season totals. On the tested team endpoint these include postseason games once they have been played. There is no season-type filter on that endpoint, so this is not a regular-season-only line.",
};

export const PLAYER_SEASON_SCOPE = {
  includesPostseason: null,
  seasonTypeFilter: "only when the request asked for one",
  label: "Player season figures are shown as returned. This draft does not relabel them as regular season or postseason unless the stored request recorded a season type.",
};

function takeSeason(rows, requestedSeason) {
  const kept = [];
  const quarantined = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.season !== requestedSeason) {
      quarantined.push({ season: row?.season ?? null, statName: row?.statName ?? row?.statType ?? null });
      continue;
    }
    kept.push(row);
  }
  return { kept, quarantined };
}

export function normalizeTeamSeasonStats(rows, { requestedSeason, school, coverage = "partial", seasonType = null } = {}) {
  if (!Number.isInteger(requestedSeason)) throw new Error("requestedSeason is required");
  const { kept, quarantined } = takeSeason(rows, requestedSeason);
  const stats = kept
    .filter((row) => nullableText(row.statName))
    .map((row) => {
      const interpreted = interpretStat(row.statName, row.statValue);
      return {
        season: requestedSeason,
        school: nullableText(row.team) || nullableText(school),
        conference: nullableText(row.conference),
        name: nullableText(row.statName),
        value: interpreted.value,
        display: interpreted.display,
        unit: interpreted.unit,
      };
    });
  return {
    season: requestedSeason,
    school: nullableText(school),
    coverage,
    requestedSeasonType: seasonType,
    scope: TEAM_SEASON_SCOPE,
    quarantinedOtherSeasons: quarantined,
    stats,
  };
}

export function normalizePlayerSeasonStats(rows, {
  requestedSeason,
  school,
  category = null,
  seasonType = null,
  coverage = "partial",
} = {}) {
  if (!Number.isInteger(requestedSeason)) throw new Error("requestedSeason is required");
  const { kept, quarantined } = takeSeason(rows, requestedSeason);
  const stats = kept.map((row) => {
    const interpreted = interpretStat(row.statType, row.stat);
    return {
      season: requestedSeason,
      playerId: row.playerId ?? null,
      player: nullableText(row.player),
      position: nullableText(row.position),
      school: nullableText(row.team) || nullableText(school),
      conference: nullableText(row.conference),
      category: nullableText(row.category) || nullableText(category),
      statType: nullableText(row.statType),
      value: interpreted.value,
      display: interpreted.display,
      unit: interpreted.unit,
    };
  });
  return {
    season: requestedSeason,
    school: nullableText(school),
    category: nullableText(category),
    coverage,
    requestedSeasonType: seasonType,
    scope: {
      ...PLAYER_SEASON_SCOPE,
      requestedSeasonType: seasonType,
      label: seasonType
        ? `Player season figures filtered by the stored request season type “${seasonType}”.`
        : PLAYER_SEASON_SCOPE.label,
    },
    quarantinedOtherSeasons: quarantined,
    categoriesPresent: [...new Set(stats.map((row) => row.category).filter(Boolean))],
    stats,
  };
}
