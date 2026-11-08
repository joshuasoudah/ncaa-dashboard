/**
 * EXPERIMENTAL candidate only. Not shown in the app.
 * Weights 40 / 30 / 20 / 10 are a design-memo draft. They are not approved.
 * Callers must leave ENABLED_BY_DEFAULT false and must not render `rankings`.
 */
export const CANDIDATE_VERSION = "0.0.0-unapproved";
export const ENABLED_BY_DEFAULT = false;
export const WEIGHTS_APPROVED = false;
export const WEIGHTS = Object.freeze({ margin: 0.4, results: 0.3, opponent: 0.2, lastFour: 0.1 });
export const HOME_ADJUSTMENT = 3;
export const MARGIN_CAP = 28;
export const PSEUDO_GAMES = 5;
export const ITERATIONS = 100;

export const ASSUMPTIONS = Object.freeze([
  "Home games subtract 3 points from the home margin before the cap. Neutral games subtract 0.",
  "Margins cap at ±28 after the home adjustment.",
  "Five pseudo-games at rating 0 pull the margin rating toward the mean.",
  "Smoothed results use (FBS wins + 2.5) / (FBS games + 5). Ties count as half a win.",
  "Opponent strength is the mean centered margin rating of FBS opponents.",
  "Last-four form is the win rate of the last four FBS finals at or before the cutoff. Fewer than four uses the games that exist. Zero games uses 0.5.",
  "FCS and other non-FBS opponents are left out of every component.",
  "Games after the cutoff, games missing a start time, and duplicate ids are left out.",
  "A team with no FBS finals is provisional at 50 and is not given a rank.",
  "If coverageComplete is not true, the update is frozen and rankings are withheld.",
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function adjustedHomeMargin({ homePoints, awayPoints, neutralSite }) {
  if (homePoints == null || awayPoints == null) return null;
  const raw = homePoints - awayPoints;
  const adj = neutralSite ? 0 : HOME_ADJUSTMENT;
  return clamp(raw - adj, -MARGIN_CAP, MARGIN_CAP);
}

function percentile(value, values) {
  const n = values.length;
  if (n <= 1) return 50;
  const below = values.filter((item) => item < value).length;
  const equal = values.filter((item) => item === value).length;
  return ((below + (equal - 1) / 2) / (n - 1)) * 100;
}

/**
 * @returns {object} Rankings are for tests of this function only.
 */
export function experimentalCandidate({
  membershipIds,
  games,
  cutoff,
  coverageComplete = false,
}) {
  const base = {
    version: CANDIDATE_VERSION,
    approved: WEIGHTS_APPROVED,
    enabledByDefault: ENABLED_BY_DEFAULT,
    weights: WEIGHTS,
    assumptions: ASSUMPTIONS,
  };
  if (coverageComplete !== true) {
    return {
      ...base,
      frozen: true,
      rankings: null,
      provisional: [],
      warning: "Power update withheld because FBS result coverage is not marked complete.",
    };
  }

  const fbs = new Set((membershipIds ?? []).map((id) => id));
  const cutoffMs = cutoff ? Date.parse(cutoff) : Number.POSITIVE_INFINITY;
  const seen = new Set();
  const accepted = [];
  for (const game of games ?? []) {
    const id = game?.id ?? game?.providerId;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    if (game.status && game.status !== "final") continue;
    if (game.completed === false) continue;
    const homeId = game.homeId ?? game.home?.providerId;
    const awayId = game.awayId ?? game.away?.providerId;
    if (!fbs.has(homeId) || !fbs.has(awayId)) continue;
    const homePoints = game.homePoints ?? game.home?.points;
    const awayPoints = game.awayPoints ?? game.away?.points;
    if (homePoints == null || awayPoints == null) continue;
    const start = game.startDate ? Date.parse(game.startDate) : NaN;
    if (!Number.isFinite(start) || start > cutoffMs) continue;
    const margin = adjustedHomeMargin({
      homePoints,
      awayPoints,
      neutralSite: game.neutralSite === true,
    });
    accepted.push({ id, homeId, awayId, homePoints, awayPoints, start, margin });
  }
  accepted.sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));

  const ids = [...fbs];
  const rating = Object.fromEntries(ids.map((id) => [id, 0]));
  const gameCount = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const game of accepted) {
    gameCount[game.homeId] += 1;
    gameCount[game.awayId] += 1;
  }

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const next = Object.fromEntries(ids.map((id) => [id, 0]));
    const sums = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const game of accepted) {
      sums[game.homeId] += rating[game.awayId] + game.margin;
      sums[game.awayId] += rating[game.homeId] - game.margin;
    }
    const active = [];
    for (const id of ids) {
      if (gameCount[id] === 0) {
        next[id] = 0;
        continue;
      }
      next[id] = (sums[id] + PSEUDO_GAMES * 0) / (gameCount[id] + PSEUDO_GAMES);
      active.push(next[id]);
    }
    const mean = active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : 0;
    for (const id of ids) {
      rating[id] = gameCount[id] === 0 ? 0 : next[id] - mean;
    }
  }

  const byTeamGames = new Map(ids.map((id) => [id, []]));
  for (const game of accepted) {
    byTeamGames.get(game.homeId).push(game);
    byTeamGames.get(game.awayId).push(game);
  }

  const rows = ids.map((id) => {
    const list = byTeamGames.get(id);
    if (list.length === 0) {
      return { providerId: id, provisional: true, score: 50, rank: null };
    }
    let wins = 0;
    const opp = [];
    for (const game of list) {
      const home = game.homeId === id;
      const us = home ? game.homePoints : game.awayPoints;
      const them = home ? game.awayPoints : game.homePoints;
      if (us > them) wins += 1;
      else if (us === them) wins += 0.5;
      opp.push(rating[home ? game.awayId : game.homeId]);
    }
    const last = list.slice(-4);
    let lastWins = 0;
    for (const game of last) {
      const home = game.homeId === id;
      const us = home ? game.homePoints : game.awayPoints;
      const them = home ? game.awayPoints : game.homePoints;
      if (us > them) lastWins += 1;
      else if (us === them) lastWins += 0.5;
    }
    return {
      providerId: id,
      provisional: false,
      games: list.length,
      marginRating: rating[id],
      smoothedResults: (wins + PSEUDO_GAMES / 2) / (list.length + PSEUDO_GAMES),
      opponentStrength: opp.reduce((sum, value) => sum + value, 0) / opp.length,
      lastFour: last.length ? lastWins / last.length : 0.5,
    };
  });

  const active = rows.filter((row) => !row.provisional);
  const marginValues = active.map((row) => row.marginRating);
  const resultValues = active.map((row) => row.smoothedResults);
  const oppValues = active.map((row) => row.opponentStrength);
  const formValues = active.map((row) => row.lastFour);
  for (const row of active) {
    const parts = {
      margin: percentile(row.marginRating, marginValues),
      results: percentile(row.smoothedResults, resultValues),
      opponent: percentile(row.opponentStrength, oppValues),
      lastFour: percentile(row.lastFour, formValues),
    };
    row.percentiles = parts;
    row.score = WEIGHTS.margin * parts.margin
      + WEIGHTS.results * parts.results
      + WEIGHTS.opponent * parts.opponent
      + WEIGHTS.lastFour * parts.lastFour;
  }
  active.sort((a, b) => b.score - a.score || String(a.providerId).localeCompare(String(b.providerId)));
  active.forEach((row, index) => {
    row.rank = index + 1;
  });

  return {
    ...base,
    frozen: false,
    rankings: active,
    provisional: rows.filter((row) => row.provisional),
    warning: "Experimental output. Do not display. Weights are not approved.",
  };
}
