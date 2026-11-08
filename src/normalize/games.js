import { dedupeById, formatKickoff, nullableNumber, nullableText } from "./common.js";

const STATUS_LABEL = {
  scheduled: "Scheduled",
  final: "Final",
  postponed: "Postponed",
  cancelled: "Cancelled",
  status_unavailable: "Status unavailable",
  in_progress_snapshot: "In progress (snapshot, not live)",
};

/**
 * Status comes from completed/scores/notes. Kickoff time never implies a live game.
 * The free tier has no scoreboard entitlement, so nothing is labeled live.
 */
export function deriveGameStatus(game) {
  const notes = (nullableText(game?.notes) || "").toLowerCase();
  if (notes.includes("cancel")) return "cancelled";
  if (notes.includes("postpon")) return "postponed";
  const home = nullableNumber(game?.homePoints);
  const away = nullableNumber(game?.awayPoints);
  if (game?.completed === true && home != null && away != null) return "final";
  if (game?.completed === true) return "status_unavailable";
  if (home != null || away != null) return "in_progress_snapshot";
  return "scheduled";
}

export function sideOf(game, providerId) {
  if (providerId == null || !game) return null;
  if (String(game.home.providerId) === String(providerId)) return "home";
  if (String(game.away.providerId) === String(providerId)) return "away";
  return null;
}

function teamSide(prefix, game) {
  const idKey = `${prefix}Id`;
  const nameKey = `${prefix}Team`;
  const confKey = `${prefix}Conference`;
  const classKey = `${prefix}Classification`;
  const pointsKey = `${prefix}Points`;
  return {
    providerId: game?.[idKey] ?? null,
    name: nullableText(game?.[nameKey]),
    conference: nullableText(game?.[confKey]),
    classification: nullableText(game?.[classKey]),
    points: nullableNumber(game?.[pointsKey]),
  };
}

export function normalizeGame(raw) {
  if (!raw || !Number.isInteger(raw.season)) return null;
  const status = deriveGameStatus(raw);
  const playoff = raw.playoff && typeof raw.playoff === "object"
    ? {
        competition: nullableText(raw.playoff.competition),
        roundName: nullableText(raw.playoff.roundName),
        bowlName: nullableText(raw.playoff.bowlName),
      }
    : null;
  return {
    providerId: raw.id ?? null,
    season: raw.season,
    week: Number.isInteger(raw.week) ? raw.week : null,
    phase: nullableText(raw.seasonType) || "unknown",
    startDate: nullableText(raw.startDate),
    startTimeTbd: raw.startTimeTBD === true,
    kickoffLabel: formatKickoff(raw.startDate, raw.startTimeTBD === true),
    neutralSite: raw.neutralSite === true,
    conferenceGame: raw.conferenceGame === true,
    venue: nullableText(raw.venue),
    notes: nullableText(raw.notes),
    status,
    statusLabel: STATUS_LABEL[status],
    live: false,
    home: teamSide("home", raw),
    away: teamSide("away", raw),
    playoff,
  };
}

export function normalizeGames(rows, { requestedSeason, coverage = "partial" } = {}) {
  if (!Number.isInteger(requestedSeason)) throw new Error("requestedSeason is required");
  const list = Array.isArray(rows) ? rows : [];
  const { kept, dropped } = dedupeById(list);
  const games = [];
  const quarantined = [];
  for (const row of kept) {
    if (row?.season !== requestedSeason) {
      quarantined.push({ id: row?.id ?? null, season: row?.season ?? null });
      continue;
    }
    const game = normalizeGame(row);
    if (game) games.push(game);
  }
  games.sort(compareGames);
  return {
    season: requestedSeason,
    coverage,
    games,
    duplicateIdsDropped: dropped,
    quarantinedOtherSeasons: quarantined,
  };
}

export function compareGames(a, b) {
  const at = a.startDate ? Date.parse(a.startDate) : Number.POSITIVE_INFINITY;
  const bt = b.startDate ? Date.parse(b.startDate) : Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return String(a.providerId).localeCompare(String(b.providerId), "en", { numeric: true });
}

/**
 * Record from loaded final games only.
 * No schedule at all => null (unknown), not 0–0.
 * A loaded schedule with no finals => zeros, which are real zeros.
 */
export function recordFromGames(providerId, games) {
  if (!Array.isArray(games)) {
    return { known: false, wins: null, losses: null, ties: null, unscoredFinals: null, scope: "not_loaded" };
  }
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let unscoredFinals = 0;
  let relevant = 0;
  for (const game of games) {
    const side = sideOf(game, providerId);
    if (!side) continue;
    relevant += 1;
    if (game.status !== "final") continue;
    const us = side === "home" ? game.home.points : game.away.points;
    const them = side === "home" ? game.away.points : game.home.points;
    if (us == null || them == null) {
      unscoredFinals += 1;
      continue;
    }
    if (us > them) wins += 1;
    else if (us < them) losses += 1;
    else ties += 1;
  }
  if (relevant === 0) {
    return { known: false, wins: null, losses: null, ties: null, unscoredFinals: null, scope: "not_in_loaded_games" };
  }
  return { known: true, wins, losses, ties, unscoredFinals, scope: "loaded_games" };
}

export function formatRecord(record) {
  if (!record?.known) return null;
  const base = `${record.wins}–${record.losses}`;
  return record.ties ? `${base}–${record.ties}` : base;
}

export function siteLabel(game, providerId) {
  if (game.neutralSite) return "Neutral";
  const side = sideOf(game, providerId);
  if (side === "home") return "Home";
  if (side === "away") return "Away";
  return "Site not set";
}
