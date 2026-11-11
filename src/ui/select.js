import { DEFAULT_SEASON, VALIDATED_SEASONS } from "../config.js";
import { normalizeConferenceName } from "../normalize/membership.js";
import { EM_DASH, formatFetchedAt, formatHeight, formatWeight } from "../normalize/common.js";
import { formatRecord, siteLabel } from "../normalize/games.js";
import { teamRecord } from "../normalize/snapshot.js";
import { resolveSeason } from "./session.js";

export { EM_DASH };

export function activeSeason(session, snapshot) {
  return resolveSeason(session, snapshot, DEFAULT_SEASON);
}

export function seasonChoices(snapshot) {
  const fromSnapshot = snapshot?.seasons?.length ? snapshot.seasons : [];
  if (snapshot && snapshot.state !== "disconnected" && fromSnapshot.length) return fromSnapshot;
  return VALIDATED_SEASONS;
}

export function teamsFor(snapshot, season) {
  if (!snapshot || snapshot.state === "disconnected") return [];
  return snapshot.memberships?.[season]?.teams ?? [];
}

export function conferencesFor(snapshot, season) {
  const names = new Set(teamsFor(snapshot, season).map((team) => team.conference));
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function divisionsFor(snapshot, season, conference = "all") {
  const names = new Set(
    teamsFor(snapshot, season)
      .filter((team) => conference === "all" || team.conference === conference)
      .map((team) => team.division)
      .filter(Boolean),
  );
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function membershipTeam(snapshot, season, providerId) {
  return teamsFor(snapshot, season).find((team) => String(team.providerId) === String(providerId)) || null;
}

export function conferenceOf(snapshot, season, providerId, fallback) {
  const team = teamsFor(snapshot, season).find((item) => String(item.providerId) === String(providerId));
  if (team) return team.conference;
  return normalizeConferenceName(fallback);
}

export function pollWeeks(snapshot, season) {
  const block = snapshot?.polls?.[season];
  if (!block) return [];
  return Object.keys(block).map(Number).sort((a, b) => a - b);
}

export function selectedPollWeek(snapshot, season, sentinel) {
  const weeks = pollWeeks(snapshot, season);
  if (!weeks.length) return null;
  if (sentinel === "latest" || sentinel == null) return weeks[weeks.length - 1];
  const week = Number(sentinel);
  return weeks.includes(week) ? week : weeks[weeks.length - 1];
}

export function gameWeeks(snapshot, season, phase) {
  const games = (snapshot?.games?.[season]?.games ?? []).filter((game) => phase === "all" || game.phase === phase);
  return [...new Set(games.map((game) => game.week).filter((week) => week != null))].sort((a, b) => a - b);
}

export function gamesForBoard(snapshot, season, { phase, week, conference }) {
  const games = snapshot?.games?.[season]?.games ?? [];
  return games.filter((game) => {
    if (phase !== "all" && game.phase !== phase) return false;
    if (week !== "all" && week != null && game.week !== Number(week)) return false;
    if (conference !== "all") {
      const home = conferenceOf(snapshot, season, game.home.providerId, game.home.conference);
      const away = conferenceOf(snapshot, season, game.away.providerId, game.away.conference);
      if (home !== conference && away !== conference) return false;
    }
    return true;
  });
}

export function gamesForTeam(snapshot, season, providerId) {
  const key = `${season}:${providerId}`;
  const personal = snapshot?.teamSchedules?.[key]?.games;
  const source = Array.isArray(personal) ? personal : (snapshot?.games?.[season]?.games ?? []);
  return source.filter((game) => {
    return String(game.home?.providerId) === String(providerId) || String(game.away?.providerId) === String(providerId);
  });
}

export function rosterFor(snapshot, season, team) {
  const school = typeof team === "string" ? team : team?.school;
  const id = typeof team === "object" ? team?.providerId : null;
  return snapshot?.rosters?.[`${season}:${id}`]
    ?? snapshot?.rosters?.[`${season}:${school}`]
    ?? null;
}

export function teamStatsFor(snapshot, season, team) {
  const school = typeof team === "string" ? team : team?.school;
  const id = typeof team === "object" ? team?.providerId : null;
  return snapshot?.teamStats?.[`${season}:${id}`]
    ?? snapshot?.teamStats?.[`${season}:${school}`]
    ?? null;
}

export function playerStatsFor(snapshot, season, school) {
  const prefix = `${season}:${school}:`;
  return Object.entries(snapshot?.playerStats ?? {})
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);
}

export function recordLabel(snapshot, season, providerId) {
  const record = teamRecord(snapshot, season, providerId);
  return {
    text: formatRecord(record) ?? EM_DASH,
    known: record.known,
    note: record.known
      ? "Record from loaded games only. It is not a certified full-season record."
      : "No loaded games for this team.",
    unscoredFinals: record.unscoredFinals,
  };
}

export function fetchedLabel(iso) {
  const formatted = formatFetchedAt(iso);
  return formatted ? `Fetched ${formatted}` : "Fetch time not stored";
}

export function hometownLine(player) {
  const place = [player.homeCity, player.homeState].filter(Boolean);
  if (player.homeCountry && player.homeCountry !== "US") place.push(player.homeCountry);
  if (!place.length && player.homeCountry) place.push(player.homeCountry);
  return place.length ? place.join(", ") : null;
}

export function measurement(player) {
  return {
    height: formatHeight(player.heightInches) ?? EM_DASH,
    weight: formatWeight(player.weightPounds) ?? EM_DASH,
    hometown: hometownLine(player) ?? EM_DASH,
    jersey: player.jersey == null ? EM_DASH : `#${player.jersey}`,
  };
}

export function pointsText(value) {
  return value == null ? EM_DASH : String(value);
}

export function opponentView(game, providerId) {
  const side = String(game.home.providerId) === String(providerId) ? "home" : "away";
  const us = side === "home" ? game.home : game.away;
  const them = side === "home" ? game.away : game.home;
  let outcome = null;
  if (game.status === "final" && us.points != null && them.points != null) {
    if (us.points > them.points) outcome = "W";
    else if (us.points < them.points) outcome = "L";
    else outcome = "T";
  }
  return {
    opponent: them.name ?? "Opponent unavailable",
    site: siteLabel(game, providerId),
    us: pointsText(us.points),
    them: pointsText(them.points),
    outcome,
  };
}
