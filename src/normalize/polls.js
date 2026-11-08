import { nullableNumber, nullableText } from "./common.js";

/**
 * Family detection from the poll name only.
 * Lower-division polls are ignored even when the name also says "Coaches".
 * Unrecognized FBS-looking names are reported, not displayed as a fourth poll.
 */
export function classifyPollName(name) {
  const text = nullableText(name) || "";
  if (/\bFCS\b|\bDII\b|\bDIII\b|\bDivision II\b|\bDivision III\b|\bDiv\.?\s?I{2,3}\b/i.test(text)) {
    return "lower_division";
  }
  if (/\bAP\b/i.test(text)) return "ap";
  if (/coaches/i.test(text)) return "coaches";
  if (/playoff committee|\bCFP\b|college football playoff|playoff rankings/i.test(text)) return "cfp";
  return "unrecognized";
}

export const POLL_LABEL = {
  ap: "AP",
  coaches: "Coaches",
  cfp: "CFP",
};

function normalizeRank(row) {
  const rank = nullableNumber(row?.rank);
  if (rank == null || !Number.isInteger(rank) || rank < 1 || rank > 25) return null;
  return {
    rank,
    providerId: row.teamId ?? row.schoolId ?? null,
    school: nullableText(row.school),
    conference: nullableText(row.conference),
    points: nullableNumber(row.points),
    firstPlaceVotes: nullableNumber(row.firstPlaceVotes),
  };
}

function emptyFamily(state, reason) {
  return {
    state,
    reason,
    ranks: [],
    pollName: null,
    isFinal: null,
  };
}

/**
 * One PollWeek object from GET /rankings.
 * fetchedAt is when this app stored the payload. It is not a release date.
 * Previous rank, movement, and a receiving-votes list are not invented.
 */
export function normalizePollWeek(raw, { fetchedAt = null, requestedSeason, requestedWeek } = {}) {
  if (!raw || !Array.isArray(raw.polls)) {
    return {
      season: requestedSeason ?? null,
      week: requestedWeek ?? null,
      seasonType: null,
      fetchedAt,
      sourcePublicationDate: null,
      state: "no_data",
      reason: "The rankings payload did not include a polls array.",
      families: {
        ap: emptyFamily("no_data", "No poll payload."),
        coaches: emptyFamily("no_data", "No poll payload."),
        cfp: emptyFamily("no_data", "No poll payload."),
      },
      unrecognizedPolls: [],
      lowerDivisionIgnored: [],
    };
  }

  if (requestedSeason != null && raw.season !== requestedSeason) {
    return normalizePollWeek({ polls: null }, {
      fetchedAt,
      requestedSeason,
      requestedWeek,
    });
  }
  if (requestedWeek != null && raw.week !== requestedWeek) {
    return normalizePollWeek({ polls: null }, {
      fetchedAt,
      requestedSeason,
      requestedWeek,
    });
  }

  const families = {
    ap: emptyFamily("not_released", "AP was not in this returned week payload. Another week was not copied in."),
    coaches: emptyFamily("not_released", "Coaches was not in this returned week payload. Another week was not copied in."),
    cfp: emptyFamily("not_released", "CFP was not in this returned week payload. Another week was not copied in."),
  };
  const unrecognizedPolls = [];
  const lowerDivisionIgnored = [];

  for (const poll of raw.polls) {
    const kind = classifyPollName(poll?.poll);
    if (kind === "lower_division") {
      lowerDivisionIgnored.push(nullableText(poll?.poll));
      continue;
    }
    if (kind === "unrecognized") {
      unrecognizedPolls.push(nullableText(poll?.poll));
      continue;
    }
    const ranks = [];
    for (const row of poll.ranks ?? []) {
      const normalized = normalizeRank(row);
      if (normalized) ranks.push(normalized);
    }
    ranks.sort((a, b) => a.rank - b.rank);
    families[kind] = {
      state: ranks.length ? "available" : "no_data",
      reason: ranks.length ? null : "The poll was returned without ranks 1 through 25.",
      ranks,
      pollName: nullableText(poll.poll),
      isFinal: typeof poll.isFinal === "boolean" ? poll.isFinal : null,
    };
  }

  return {
    season: raw.season,
    week: raw.week,
    seasonType: nullableText(raw.seasonType),
    fetchedAt,
    sourcePublicationDate: null,
    state: "fresh_snapshot",
    reason: null,
    families,
    unrecognizedPolls,
    lowerDivisionIgnored,
  };
}

export function normalizeRankingsResponse(payload, options) {
  const weeks = Array.isArray(payload) ? payload : payload ? [payload] : [];
  if (weeks.length === 0) {
    return [normalizePollWeek(null, options)];
  }
  return weeks.map((week) => normalizePollWeek(week, {
    ...options,
    requestedWeek: options.requestedWeek ?? null,
    requestedSeason: options.requestedSeason ?? null,
  }));
}
