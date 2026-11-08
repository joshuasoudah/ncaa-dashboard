import { nullableNumber, nullableText } from "./common.js";

const GROUP_ORDER = [
  ["Quarterbacks", ["QB"]],
  ["Running backs", ["RB", "FB"]],
  ["Receivers", ["WR"]],
  ["Tight ends", ["TE"]],
  ["Offensive line", ["OL", "OT", "OG", "C", "IOL"]],
  ["Defensive line", ["DL", "DE", "DT", "NT", "EDGE"]],
  ["Linebackers", ["LB", "ILB", "OLB", "MLB"]],
  ["Defensive backs", ["DB", "CB", "S", "FS", "SS", "NB"]],
  ["Specialists", ["K", "P", "LS", "PK", "HOLDER"]],
  ["Athletes", ["ATH"]],
];

export const CLASS_OMISSION = {
  included: false,
  reason: "roster.year is deprecated. Authenticated 2026 rows were all year 1, so class is omitted rather than guessed.",
};

/**
 * Drops year, coordinates, county codes, recruit ids, and any photo field.
 * Does not invent starter, injury, eligibility, or class.
 */
export function normalizeRoster(rows, { requestedSeason, school, coverage = "partial" } = {}) {
  if (!Number.isInteger(requestedSeason)) throw new Error("requestedSeason is required");
  const list = Array.isArray(rows) ? rows : [];
  const players = list
    .filter((row) => row && (nullableText(row.firstName) || nullableText(row.lastName)))
    .map((row) => ({
      providerId: row.id ?? null,
      firstName: nullableText(row.firstName),
      lastName: nullableText(row.lastName),
      jersey: nullableNumber(row.jersey),
      position: nullableText(row.position),
      heightInches: nullableNumber(row.height),
      weightPounds: nullableNumber(row.weight),
      homeCity: nullableText(row.homeCity),
      homeState: nullableText(row.homeState),
      homeCountry: nullableText(row.homeCountry),
    }));

  return {
    season: requestedSeason,
    school: nullableText(school),
    coverage,
    class: CLASS_OMISSION,
    starters: null,
    headshots: false,
    players,
  };
}

export function groupRoster(players) {
  const buckets = new Map(GROUP_ORDER.map(([label]) => [label, []]));
  buckets.set("Other", []);
  buckets.set("Unlisted position", []);
  for (const player of players ?? []) {
    const pos = (player.position || "").toUpperCase();
    if (!pos) {
      buckets.get("Unlisted position").push(player);
      continue;
    }
    const match = GROUP_ORDER.find(([, codes]) => codes.includes(pos));
    buckets.get(match ? match[0] : "Other").push(player);
  }
  return [...buckets.entries()]
    .filter(([, list]) => list.length)
    .map(([label, list]) => ({
      label,
      players: list.slice().sort((a, b) => {
        const aj = a.jersey ?? 9999;
        const bj = b.jersey ?? 9999;
        if (aj !== bj) return aj - bj;
        return `${a.lastName}`.localeCompare(`${b.lastName}`);
      }),
    }));
}
