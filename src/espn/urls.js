const HOST = "site.api.espn.com";

function url(pathname, params) {
  const built = new URL(`https://${HOST}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") built.searchParams.set(key, String(value));
  }
  return built;
}

export function scoreboardUrl({ season, week, seasontype = 2, dates } = {}) {
  const params = { groups: 80, limit: 1000 };
  if (dates) params.dates = dates;
  else {
    if (season) params.year = season;
    if (week) params.week = week;
    if (seasontype) params.seasontype = seasontype;
  }
  return url("/apis/site/v2/sports/football/college-football/scoreboard", params);
}

export function standingsUrl(season) {
  return url("/apis/v2/sports/football/college-football/standings", { season });
}

export function rankingsUrl({ season, week, seasontype = 2 }) {
  return url("/apis/site/v2/sports/football/college-football/rankings", {
    seasons: season,
    week,
    seasontype,
  });
}

export function rosterUrl(teamId, season) {
  return url(`/apis/site/v2/sports/football/college-football/teams/${encodeURIComponent(teamId)}/roster`, { season });
}

export function statisticsUrl(teamId, season) {
  return url(`/apis/site/v2/sports/football/college-football/teams/${encodeURIComponent(teamId)}/statistics`, { season });
}

export function scheduleUrl(teamId, { season, seasontype }) {
  return url(`/apis/site/v2/sports/football/college-football/teams/${encodeURIComponent(teamId)}/schedule`, {
    season,
    seasontype,
  });
}

export function assertEspnUrl(value) {
  const parsed = value instanceof URL ? value : new URL(value);
  if (parsed.protocol !== "https:" || parsed.host !== HOST) {
    throw Object.assign(new Error("upstream_not_allowed"), { code: "upstream_not_allowed" });
  }
  if (!parsed.pathname.startsWith("/apis/")) {
    throw Object.assign(new Error("path_not_allowed"), { code: "path_not_allowed" });
  }
  return parsed;
}
