/** Transient navigation. Theme and motion preferences are stored elsewhere and are not reset. */
export function createSession() {
  return {
    mainTab: "rankings",
    rankingView: "power",
    conference: "all",
    division: "all",
    phase: "all",
    pollWeek: "latest",
    gameWeek: "all",
    season: "default",
    openTeamId: null,
    teamTab: "games",
    statsSide: "team",
    openPlayerId: null,
    dialog: null,
    liveOnly: false,
  };
}

export function reopen(session) {
  session.conference = "all";
  session.division = "all";
  session.liveOnly = false;
  session.openTeamId = null;
  session.teamTab = "games";
  session.statsSide = "team";
  session.openPlayerId = null;
  session.dialog = null;
  return session;
}

export function resolveSeason(session, snapshot, fallbackSeason) {
  if (session.season === "default" || session.season == null || session.season === "") {
    return snapshot?.defaultSeason ?? fallbackSeason;
  }
  const year = Number(session.season);
  return Number.isInteger(year) ? year : fallbackSeason;
}
