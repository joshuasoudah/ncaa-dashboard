import { nullableText } from "./common.js";

const INDEPENDENT_NAMES = new Set([
  "",
  "independent",
  "independents",
  "fbs independents",
  "fbs independent",
]);

export function normalizeConferenceName(name) {
  const text = nullableText(name);
  if (text == null) return "Independents";
  if (INDEPENDENT_NAMES.has(text.toLowerCase())) return "Independents";
  return text;
}

/**
 * Season membership is stored under the requested year.
 * A later season's conference is never written back onto an earlier year.
 * Logos, brand colors, and social handles are dropped (no trademark rights).
 */
export function normalizeMembership(rows, { requestedSeason, coverage = "partial" } = {}) {
  if (!Number.isInteger(requestedSeason)) {
    throw new Error("requestedSeason is required");
  }
  const list = Array.isArray(rows) ? rows : [];
  const teams = list
    .filter((row) => {
      if (!row || row.id == null || !nullableText(row.school)) return false;
      const classification = nullableText(row.classification);
      return classification == null || classification.toLowerCase() === "fbs";
    })
    .map((row) => ({
      season: requestedSeason,
      providerId: row.id,
      school: nullableText(row.school),
      mascot: nullableText(row.mascot),
      abbreviation: nullableText(row.abbreviation),
      conference: normalizeConferenceName(row.conference),
      division: nullableText(row.division),
      classification: "fbs",
      city: nullableText(row.location?.city ?? row.city),
      state: nullableText(row.location?.state ?? row.state),
    }));

  const nonFbs = list.filter((row) => row?.classification && String(row.classification).toLowerCase() !== "fbs").length;

  return {
    season: requestedSeason,
    coverage,
    count: teams.length,
    countIsCensus: coverage === "complete",
    nonFbsDropped: nonFbs,
    teams,
    note: "Membership count follows this response only. Do not reuse it as every season's size.",
  };
}

export function conferencesIn(membership) {
  const names = new Set((membership?.teams ?? []).map((team) => team.conference));
  return [...names].sort((a, b) => a.localeCompare(b));
}
