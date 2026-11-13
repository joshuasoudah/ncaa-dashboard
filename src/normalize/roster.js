import { nullableNumber, nullableText } from "./common.js";

const GROUP_ORDER = [
  ["Quarterbacks", ["QB"]],
  ["Running backs", ["RB", "HB", "TB"]],
  ["Fullbacks", ["FB"]],
  ["Wide receivers", ["WR"]],
  ["Tight ends", ["TE"]],
  ["Offensive line", ["OT", "T", "G", "OG", "C", "OL", "IOL", "LT", "RT", "LG", "RG", "OC"]],
  ["Defensive line", ["DE", "DT", "NT", "DL", "EDGE"]],
  ["Linebackers", ["LB", "OLB", "ILB", "MLB"]],
  ["Cornerbacks", ["CB", "NB", "NCB"]],
  ["Safeties", ["S", "FS", "SS", "DB"]],
  ["Special teams", ["PK", "K", "P", "LS", "HOLDER"]],
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
  const codesByLabel = new Map(GROUP_ORDER);
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
    .map(([label, list]) => {
      const codes = codesByLabel.get(label) || [];
      return {
        label,
        players: list.slice().sort((a, b) => {
          const ap = codes.indexOf((a.position || "").toUpperCase());
          const bp = codes.indexOf((b.position || "").toUpperCase());
          const ai = ap === -1 ? 99 : ap;
          const bi = bp === -1 ? 99 : bp;
          if (ai !== bi) return ai - bi;
          const aj = a.jersey ?? 9999;
          const bj = b.jersey ?? 9999;
          if (aj !== bj) return aj - bj;
          return `${a.lastName}`.localeCompare(`${b.lastName}`);
        }),
      };
    });
}
