import { formatKickoff, nullableNumber, nullableText } from "../normalize/common.js";
import { statusPresentation } from "./live.js";

export function teamName(team) {
  if (!team) return null;
  if (nullableText(team.displayName)) return nullableText(team.displayName);
  const location = nullableText(team.location) || nullableText(team.nickname);
  const name = nullableText(team.name);
  if (location && name) return `${location} ${name}`;
  return location || name;
}

export function teamLogo(team) {
  if (!team) return null;
  if (typeof team.logo === "string") return team.logo;
  const href = team.logos?.find((logo) => logo?.href)?.href;
  return href || null;
}

function pointsOf(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return nullableNumber(value.value ?? value.displayValue);
  return nullableNumber(value);
}

function phaseOf(seasonType) {
  const type = typeof seasonType === "object" ? seasonType?.type ?? seasonType?.id : seasonType;
  const number = Number(type);
  if (number === 3) return "postseason";
  if (number === 2) return "regular";
  if (number === 1) return "preseason";
  return "unknown";
}

export function collectMembership(standings, { requestedSeason } = {}) {
  if (!Number.isInteger(requestedSeason)) throw new Error("requestedSeason is required");
  const teams = [];
  const seen = new Set();
  for (const conference of standings?.children || []) {
    walkConference(conference, conference?.name || "Independents", null, teams, seen, requestedSeason);
  }
  return {
    season: requestedSeason,
    coverage: "standings-walk",
    count: teams.length,
    countIsCensus: false,
    note: "Count is the recursive walk of this standings response, including nested divisions. It is not a hardcoded season size.",
    teams,
  };
}

function walkConference(node, conference, division, teams, seen, season) {
  const entries = node?.standings?.entries || [];
  for (const entry of entries) {
    const team = entry?.team;
    const id = team?.id != null ? String(team.id) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const overall = (entry.stats || []).find((stat) => stat?.type === "total" && stat?.name === "overall");
    teams.push({
      season,
      providerId: id,
      school: teamName(team),
      abbreviation: nullableText(team.abbreviation),
      conference: conference || "Independents",
      division: division || null,
      classification: "fbs",
      logo: teamLogo(team),
      recordText: nullableText(overall?.displayValue),
    });
  }
  for (const child of node?.children || []) {
    walkConference(child, conference, child?.name || division, teams, seen, season);
  }
}

export function normalizeEvent(event, { requestedSeason = null, phaseFallback = null } = {}) {
  const competition = event?.competitions?.[0];
  if (!event || !competition) return { game: null, quarantine: "missing_competition" };
  const eventSeason = event.season?.year ?? null;
  if (eventSeason == null) return { game: null, quarantine: "missing_event_season" };
  if (requestedSeason != null && eventSeason !== requestedSeason) {
    return { game: null, quarantine: "event_season_mismatch", eventSeason };
  }
  const presentation = statusPresentation(competition.status);
  const competitors = competition.competitors || [];
  const home = competitors.find((side) => side.homeAway === "home") || null;
  const away = competitors.find((side) => side.homeAway === "away") || null;
  const noteText = (competition.notes || []).map((note) => note?.headline || note?.text).filter(Boolean).join("; ") || null;
  return {
    quarantine: null,
    game: {
      providerId: event.id != null ? String(event.id) : null,
      season: eventSeason,
      week: event.week?.number ?? null,
      phase: phaseOf(event.season?.type) === "unknown" && phaseFallback ? phaseFallback : phaseOf(event.season?.type),
      startDate: event.date || competition.date || null,
      kickoffLabel: formatKickoff(event.date || competition.date, false),
      neutralSite: competition.neutralSite === true,
      venue: nullableText(competition.venue?.fullName || competition.venue?.displayName),
      notes: noteText,
      status: presentation.status,
      statusLabel: presentation.statusLabel,
      live: presentation.live,
      clockLabel: presentation.clockLabel || null,
      home: side(home),
      away: side(away),
    },
  };
}

function side(competitor) {
  if (!competitor) return { providerId: null, name: null, abbreviation: null, points: null, logo: null, winner: null };
  return {
    providerId: competitor.team?.id != null ? String(competitor.team.id) : null,
    name: teamName(competitor.team),
    abbreviation: nullableText(competitor.team?.abbreviation),
    points: pointsOf(competitor.score),
    logo: teamLogo(competitor.team),
    winner: competitor.winner === true ? true : competitor.winner === false ? false : null,
  };
}

export function normalizeScoreboard(payload, { requestedSeason = null, fetchedAt = null } = {}) {
  const games = [];
  const quarantined = [];
  for (const event of payload?.events || []) {
    const result = normalizeEvent(event, { requestedSeason });
    if (result.game) games.push(result.game);
    else quarantined.push({ id: event?.id ?? null, reason: result.quarantine });
  }
  const liveCount = games.filter((game) => game.live).length;
  return {
    fetchedAt,
    season: payload?.season?.year ?? requestedSeason,
    week: payload?.week?.number ?? null,
    coverage: "partial",
    liveCount,
    liveClockObserved: false,
    games,
    quarantined,
  };
}

export function normalizeSchedule(payload, { requestedSeason, seasonType = null } = {}) {
  const phaseFallback = Number(seasonType) === 3 ? "postseason" : Number(seasonType) === 2 ? "regular" : null;
  const games = [];
  const quarantined = [];
  for (const event of payload?.events || []) {
    const result = normalizeEvent(event, { requestedSeason, phaseFallback });
    if (result.game) games.push(result.game);
    else quarantined.push({ id: event?.id ?? null, reason: result.quarantine, topLevelSeason: payload?.season?.year ?? null });
  }
  return {
    requestedSeason,
    topLevelSeason: payload?.season?.year ?? null,
    echoedRequest: payload?.requestedSeason?.year ?? null,
    coverage: "partial",
    games,
    quarantined,
  };
}

function pollFamily(poll) {
  const name = `${poll?.name || ""} ${poll?.shortName || ""}`;
  const type = String(poll?.type || "").toLowerCase();
  if (type === "fcs" || /division ii|division iii|\bfcs\b/i.test(name)) return "lower_division";
  if (type === "cfp" || /playoff committee/i.test(name)) return "cfp";
  if (type === "ap" || /\bAP\b/.test(name)) return "ap";
  if (type === "usa" || /coaches/i.test(name)) return "coaches";
  return "unrecognized";
}

function rankRow(row) {
  const current = nullableNumber(row?.current);
  if (current == null || current < 1 || current > 25) return null;
  const previous = nullableNumber(row?.previous);
  return {
    rank: current,
    previousRank: previous != null && previous >= 1 && previous <= 25 ? previous : null,
    previousUnranked: previous === 0,
    trend: previous != null && previous >= 1 && previous <= 25 ? nullableText(row?.trend) : null,
    providerId: row?.team?.id != null ? String(row.team.id) : null,
    school: teamName(row?.team),
    abbreviation: nullableText(row?.team?.abbreviation),
    conference: nullableText(row?.conference?.name || row?.conference),
    points: nullableNumber(row?.points),
    firstPlaceVotes: nullableNumber(row?.firstPlaceVotes),
    recordSummary: nullableText(row?.recordSummary),
    logo: teamLogo(row?.team),
  };
}

function voteRow(row) {
  const current = nullableNumber(row?.current);
  if (current != null && current >= 1 && current <= 25) return null;
  const previous = nullableNumber(row?.previous);
  return {
    providerId: row?.team?.id != null ? String(row.team.id) : null,
    school: teamName(row?.team),
    points: nullableNumber(row?.points),
    previousRank: previous != null && previous >= 1 && previous <= 25 ? previous : null,
    recordSummary: nullableText(row?.recordSummary),
  };
}

function emptyFamily(state, reason) {
  return { state, reason, ranks: [], receivingVotes: [], pollName: null, dateLabel: null, pointsUsed: false, votesUsed: false };
}

export function normalizeRankings(payload, { requestedSeason = null, requestedWeek = null, fetchedAt = null } = {}) {
  const echoedWeek = payload?.requestedSeason?.week?.number ?? null;
  const echoedSeason = payload?.requestedSeason?.year ?? null;
  if (requestedWeek != null && echoedWeek != null && echoedWeek !== requestedWeek) {
    return {
      state: "wrong_week",
      reason: `ESPN echoed week ${echoedWeek} for a week ${requestedWeek} request. Those polls are not shown as week ${requestedWeek}.`,
      season: echoedSeason,
      week: echoedWeek,
      requestedWeek,
      fetchedAt,
      families: {
        ap: emptyFamily("wrong_week", "Not the requested week."),
        coaches: emptyFamily("wrong_week", "Not the requested week."),
        cfp: emptyFamily("wrong_week", "Not the requested week."),
      },
      lowerDivisionIgnored: [],
      unrecognizedPolls: [],
    };
  }

  const families = {
    ap: emptyFamily("not_released", "AP was not in this rankings payload."),
    coaches: emptyFamily("not_released", "Coaches was not in this rankings payload."),
    cfp: emptyFamily("not_released", "CFP was not in this rankings payload."),
  };
  const lowerDivisionIgnored = [];
  const unrecognizedPolls = [];
  for (const poll of payload?.rankings || []) {
    const occurrence = poll?.occurrence?.number ?? null;
    if (echoedWeek != null && occurrence != null && occurrence !== echoedWeek) continue;
    const kind = pollFamily(poll);
    if (kind === "lower_division") {
      lowerDivisionIgnored.push(poll.name || poll.type);
      continue;
    }
    if (kind === "unrecognized") {
      unrecognizedPolls.push(poll.name || poll.type || "unnamed");
      continue;
    }
    const ranks = (poll.ranks || []).map(rankRow).filter(Boolean).sort((a, b) => a.rank - b.rank);
    const receivingVotes = (poll.others || []).map(voteRow).filter((row) => row && row.school);
    const pointsUsed = ranks.some((rank) => rank.points) || receivingVotes.some((row) => row.points);
    const votesUsed = ranks.some((rank) => rank.firstPlaceVotes);
    families[kind] = {
      state: ranks.length ? "available" : "no_data",
      reason: ranks.length ? null : "The poll did not include ranks 1 through 25.",
      ranks,
      receivingVotes,
      pollName: poll.name || null,
      dateLabel: poll.date || null,
      headline: poll.headline || null,
      pointsUsed,
      votesUsed,
    };
  }
  return {
    state: "available",
    season: echoedSeason ?? requestedSeason,
    week: echoedWeek ?? requestedWeek,
    fetchedAt,
    sourceDateNote: "ESPN date labels are shown as supplied. They are not treated as a certified publication timestamp.",
    families,
    lowerDivisionIgnored,
    unrecognizedPolls,
  };
}

function athleteRecord(athlete) {
  const experience = athlete?.experience?.displayValue || null;
  return {
    providerId: athlete?.id != null ? String(athlete.id) : null,
    firstName: nullableText(athlete?.firstName),
    lastName: nullableText(athlete?.lastName),
    displayName: nullableText(athlete?.displayName) || teamName(athlete),
    jersey: nullableNumber(athlete?.jersey),
    position: nullableText(athlete?.position?.abbreviation || athlete?.position),
    heightInches: nullableNumber(athlete?.height),
    displayHeight: nullableText(athlete?.displayHeight),
    weightPounds: nullableNumber(athlete?.weight),
    displayWeight: nullableText(athlete?.displayWeight),
    classLabel: nullableText(experience),
    hometown: nullableText(athlete?.birthPlace?.displayText),
    headshot: nullableText(athlete?.headshot?.href),
    headshotAlt: nullableText(athlete?.headshot?.alt) || nullableText(athlete?.displayName),
    rosterStatus: nullableText(athlete?.status?.name),
    injuries: Array.isArray(athlete?.injuries) ? athlete.injuries.length : null,
  };
}

export function normalizeRoster(payload, { requestedSeason, teamId } = {}) {
  const year = payload?.season?.year ?? null;
  if (requestedSeason != null && year != null && year !== requestedSeason) {
    return {
      state: "season_mismatch",
      season: year,
      requestedSeason,
      teamId: teamId != null ? String(teamId) : null,
      players: [],
      reason: "Roster season did not match the request. A different season was not substituted.",
    };
  }
  const players = [];
  const groups = Array.isArray(payload?.athletes) ? payload.athletes : [];
  for (const group of groups) {
    if (Array.isArray(group?.items)) {
      for (const athlete of group.items) players.push(athleteRecord(athlete));
    } else if (group?.displayName || group?.firstName) {
      players.push(athleteRecord(group));
    }
  }
  if (!players.length) {
    return {
      state: "no_data",
      season: year,
      requestedSeason,
      teamId: teamId != null ? String(teamId) : payload?.team?.id ?? null,
      players: [],
      reason: "ESPN returned roster groups with no players.",
    };
  }
  return {
    state: "available",
    season: year,
    requestedSeason,
    teamId: teamId != null ? String(teamId) : payload?.team?.id != null ? String(payload.team.id) : null,
    school: teamName(payload?.team),
    players,
    starters: null,
    starterReason: "No starter designation is in this roster. An empty depth chart is not used to guess starters.",
    injuryNote: "An empty injuries array is not a health status.",
  };
}

export function normalizeTeamStatistics(payload, { requestedSeason, teamId } = {}) {
  const returned = payload?.season?.year ?? null;
  const echoed = payload?.requestedSeason?.year ?? null;
  if (returned !== requestedSeason || (echoed != null && echoed !== requestedSeason)) {
    return {
      state: "season_mismatch",
      requestedSeason,
      returnedSeason: returned,
      echoedSeason: echoed,
      teamId: teamId != null ? String(teamId) : null,
      stats: [],
      reason: `Statistics requested for ${requestedSeason} came back with top-level season ${returned ?? "unknown"}. Figures are withheld rather than labeled as ${requestedSeason}.`,
    };
  }
  return {
    state: "unparsed",
    requestedSeason,
    returnedSeason: returned,
    teamId: teamId != null ? String(teamId) : null,
    stats: [],
    reason: "Season metadata matched, but this draft does not yet map category tables into the view.",
  };
}
