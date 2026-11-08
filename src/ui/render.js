import { APP_NAME, APP_TAGLINE } from "../config.js";
import { groupRoster } from "../normalize/roster.js";
import { strokeFor } from "./conferences.js";
import { el } from "./dom.js";
import {
  EM_DASH,
  activeSeason,
  conferenceOf,
  conferencesFor,
  fetchedLabel,
  gameWeeks,
  gamesForBoard,
  gamesForTeam,
  measurement,
  opponentView,
  playerStatsFor,
  pointsText,
  pollWeeks,
  recordLabel,
  rosterFor,
  seasonChoices,
  selectedPollWeek,
  teamStatsFor,
  teamsFor,
} from "./select.js";

const RANKING_VIEWS = [
  ["power", "Power"],
  ["ap", "AP"],
  ["coaches", "Coaches"],
  ["cfp", "CFP"],
];

export function renderApp(root, model) {
  const doc = root.ownerDocument;
  const snapshot = model.snapshot;
  const session = model.session;
  const season = activeSeason(session, snapshot);
  const dialog = renderDialog(doc, session);
  root.replaceChildren(
    renderHeader(doc, model),
    renderBanner(doc, snapshot),
    renderStatus(doc, model, season),
    renderTabs(doc, session),
    renderFilters(doc, model, season),
    renderLegend(doc, snapshot, season),
    renderMain(doc, model, season),
    renderFooter(doc, snapshot),
  );
  if (dialog) root.append(dialog);
  syncMotionControl(root, model.reduceMotion);
}

function renderHeader(doc, model) {
  const themeLabel = model.theme === "light" ? "Use dark theme" : "Use light theme";
  const autoLabel = model.autoRefresh === false ? "Auto-refresh off" : "Auto-refresh on";
  return el(doc, "header", { class: "scoreboard" }, [
    el(doc, "div", { class: "brand" }, [
      el(doc, "div", { class: "monogram", "aria-hidden": "true", text: "FB" }),
      el(doc, "div", {}, [
        el(doc, "h1", { text: APP_NAME }),
        el(doc, "p", { class: "tagline", text: APP_TAGLINE }),
      ]),
    ]),
    el(doc, "div", { class: "header-actions" }, [
      el(doc, "button", { type: "button", id: "theme-toggle", "data-action": "theme", text: themeLabel }),
      el(doc, "button", {
        type: "button",
        id: "auto-refresh",
        "data-action": "auto-refresh",
        "aria-pressed": model.autoRefresh === false ? "false" : "true",
        text: autoLabel,
      }),
      el(doc, "button", { type: "button", id: "refresh", "data-action": "refresh", text: "Reload snapshot" }),
    ]),
  ]);
}

function renderBanner(doc, snapshot) {
  const wrap = el(doc, "div", { class: "banners" });
  if (!snapshot || snapshot.state === "disconnected") {
    wrap.append(el(doc, "p", {
      class: "banner plan",
      role: "note",
      text: "Not connected. Auto-refresh does not call ESPN until a normalizing service is available, and it pauses while this tab is hidden.",
    }));
  }
  if (snapshot?.fixtureClass === "public-espn-capture") {
    wrap.append(el(doc, "p", {
      class: "banner capture",
      role: "note",
      "data-testid": "capture-banner",
      text: "Captured public ESPN snapshot from Nov 8, 2026. Not a live connection. Every game in the week 10 scoreboard was final, so no live clock was observed.",
    }));
  }
  if (snapshot?.synthetic) {
    wrap.append(el(doc, "p", {
      class: "banner test",
      role: "alert",
      "data-testid": "test-banner",
      text: "Test mode. Teams, scores, and ranks on this screen are synthetic fixtures for interface checks. They are not a College Football Data snapshot and not real results.",
    }));
  }
  if (snapshot?.state === "stale_snapshot" && snapshot.fixtureClass !== "public-espn-capture") {
    wrap.append(el(doc, "p", {
      class: "banner stale",
      text: `Stored snapshot is stale. ${snapshot.staleReason || "A newer fetch has not replaced it."} It is not live.`,
    }));
  }
  if (snapshot?.state === "quota_limited") {
    wrap.append(el(doc, "p", {
      class: "banner quota",
      text: "Local budget stopped a new fetch. Showing the last good snapshot when one exists. This draft does not enforce a global provider quota.",
    }));
  }
  if (snapshot?.state === "error") {
    wrap.append(el(doc, "p", {
      class: "banner error",
      role: "alert",
      text: "The last fetch failed. No retry loop ran. Nothing new was invented to fill the gap.",
    }));
  }
  return wrap;
}

function renderStatus(doc, model, season) {
  const snapshot = model.snapshot;
  const line = el(doc, "p", { id: "status", class: "status-line", role: "status" });
  if (!snapshot || snapshot.state === "disconnected") {
    line.textContent = `Not connected. No snapshot is loaded for ${season}. Reload does not contact ESPN.`;
  } else if (snapshot.state === "no_data") {
    line.textContent = `No data is stored for ${season}.`;
  } else {
    const count = snapshot.memberships?.[season]?.count;
    const countText = count ? ` ${count} FBS teams in the ${season} standings walk.` : "";
    line.textContent = `${fetchedLabel(snapshot.fetchedAt)}. Stored snapshot, not a live board.${countText}`;
  }
  const block = el(doc, "div", { class: "status-block" }, [line]);
  if (model.status) block.append(el(doc, "p", { class: "status-line extra", text: model.status }));
  const notes = (snapshot?.notices || []).filter(Boolean);
  if (notes.length && snapshot?.state !== "disconnected") {
    const list = el(doc, "ul", { class: "notes" });
    for (const note of notes) list.append(el(doc, "li", { text: note }));
    block.append(el(doc, "details", { class: "notes-wrap" }, [
      el(doc, "summary", { text: "Data notes" }),
      list,
    ]));
  }
  return block;
}

function renderTabs(doc, session) {
  const list = el(doc, "div", { class: "tabs", role: "tablist", "aria-label": "Main views" });
  for (const [value, label] of [["rankings", "Rankings"], ["games", "Games"]]) {
    const selected = session.mainTab === value;
    list.append(el(doc, "button", {
      type: "button",
      class: "tab",
      role: "tab",
      id: `tab-${value}`,
      "aria-selected": selected ? "true" : "false",
      "aria-controls": "main-panel",
      tabindex: selected ? "0" : "-1",
      "data-action": "main-tab",
      "data-value": value,
      text: label,
    }));
  }
  return list;
}

function renderFilters(doc, model, season) {
  const { session, snapshot } = model;
  const row = el(doc, "div", { class: "filters" });
  row.append(selectControl(doc, {
    id: "season",
    label: "Season",
    action: "season",
    value: String(season),
    options: seasonChoices(snapshot).map((year) => [String(year), String(year)]),
  }));

  if (session.mainTab === "rankings") {
    row.append(selectControl(doc, {
      id: "ranking-view",
      label: "Ranking",
      action: "ranking-view",
      value: session.rankingView,
      options: RANKING_VIEWS,
    }));
    row.append(conferenceSelect(doc, snapshot, season, session));
    row.append(liveButton(doc, session));
    const weeks = pollWeeks(snapshot, season);
    if (weeks.length) {
      const selected = String(selectedPollWeek(snapshot, season, session.pollWeek));
      row.append(selectControl(doc, {
        id: "poll-week",
        label: "Week",
        action: "poll-week",
        value: selected,
        options: weeks.map((week) => [String(week), `Week ${week}`]),
      }));
    }
  } else {
    row.append(selectControl(doc, {
      id: "phase",
      label: "Phase",
      action: "phase",
      value: session.phase,
      options: [["all", "All phases"], ["regular", "Regular season"], ["postseason", "Postseason"]],
    }));
    row.append(conferenceSelect(doc, snapshot, season, session));
    row.append(liveButton(doc, session));
    const weeks = gameWeeks(snapshot, season, session.phase);
    if (weeks.length) {
      row.append(selectControl(doc, {
        id: "game-week",
        label: "Week",
        action: "game-week",
        value: session.gameWeek,
        options: [["all", "All weeks"], ...weeks.map((week) => [String(week), `Week ${week}`])],
      }));
    }
  }
  return row;
}

function liveButton(doc, session) {
  const on = session.liveOnly === true;
  return el(doc, "button", {
    type: "button",
    id: "live-only",
    class: on ? "live-toggle on" : "live-toggle",
    "data-action": "live-only",
    "aria-pressed": on ? "true" : "false",
    text: "Live now",
  });
}

function conferenceSelect(doc, snapshot, season, session) {
  const names = conferencesFor(snapshot, season);
  const options = [["all", "All conferences"], ...names.map((name) => [name, name])];
  return selectControl(doc, {
    id: "conference",
    label: "Conference",
    action: "conference",
    value: options.some(([value]) => value === session.conference) ? session.conference : "all",
    options,
  });
}

function selectControl(doc, { id, label, action, value, options }) {
  const select = el(doc, "select", { id, "data-action": action, "aria-label": label });
  for (const [optionValue, optionLabel] of options) {
    const option = el(doc, "option", { value: optionValue, text: optionLabel });
    if (optionValue === value) option.selected = true;
    select.append(option);
  }
  return el(doc, "label", { class: "filter" }, [
    el(doc, "span", { text: label }),
    select,
  ]);
}

function renderLegend(doc, snapshot, season) {
  const names = conferencesFor(snapshot, season);
  const box = el(doc, "section", { class: "legend-wrap", "aria-label": "Conference colors" });
  if (!names.length) {
    box.append(el(doc, "p", {
      class: "legend-empty",
      text: "Conference color legend appears when a season snapshot includes membership.",
    }));
    return box;
  }
  box.append(el(doc, "h2", { class: "legend-title", text: "Conference colors" }));
  const list = el(doc, "ul", { class: "legend" });
  for (const name of names) {
    const stroke = strokeFor(name);
    const swatch = el(doc, "span", {
      class: stroke.dashed ? "swatch dashed" : "swatch",
      "aria-hidden": "true",
    });
    swatch.style.background = stroke.dashed ? "transparent" : stroke.color;
    swatch.style.borderColor = stroke.color;
    list.append(el(doc, "li", {}, [swatch, el(doc, "span", { text: name })]));
  }
  box.append(list, el(doc, "p", {
    class: "legend-note",
    text: "Colors are app labels for conferences, not school colors. The name is always shown with the color.",
  }));
  return box;
}

function renderMain(doc, model, season) {
  const panel = el(doc, "div", { id: "main-panel", role: "tabpanel", tabindex: "0" });
  if (model.session.mainTab === "games") panel.append(renderGames(doc, model, season));
  else panel.append(renderRankings(doc, model, season));
  return panel;
}

function renderRankings(doc, model, season) {
  const view = model.session.rankingView;
  if (view === "power") return renderPower(doc, model.snapshot, season);
  return renderPoll(doc, model, season, view);
}

function renderPower(doc, snapshot, season) {
  const card = el(doc, "section", { class: "empty-card", "data-testid": "power-unavailable" }, [
    el(doc, "h2", { text: "Power rankings unavailable" }),
    el(doc, "p", { text: "A candidate formula exists only as a disabled experiment. Preliminary weights of 40, 30, 20, and 10 are not approved. This screen does not calculate or show model ranks, scores, or movement." }),
    el(doc, "p", { text: `Official AP, Coaches, and CFP polls are separate. ${season} membership is not turned into a power table.` }),
    el(doc, "button", { type: "button", class: "text-button", "data-action": "dialog", "data-value": "methodology", text: "Methodology notes" }),
  ]);
  if (!snapshot || snapshot.state === "disconnected") {
    card.append(el(doc, "p", { class: "fine", text: "No season snapshot is connected, so there is also no team list under this view." }));
  }
  return card;
}

function renderPoll(doc, model, season, family) {
  const snapshot = model.snapshot;
  const label = family === "ap" ? "AP" : family === "coaches" ? "Coaches" : "CFP";
  if (!snapshot || snapshot.state === "disconnected") {
    return emptyCard(doc, `${label} snapshot not loaded`, `No ${label} poll is stored for ${season}. An empty week is not filled with another poll or with ranks past 25.`);
  }
  const week = selectedPollWeek(snapshot, season, model.session.pollWeek);
  const payload = week == null ? null : snapshot.polls?.[season]?.[week];
  if (!payload) {
    return emptyCard(doc, `No ${label} week stored`, `Nothing is stored for ${season}. This is not treated as a release calendar.`);
  }
  const poll = payload.families[family];
  const head = el(doc, "div", { class: "poll-meta" }, [
    el(doc, "p", { text: `${season} week ${payload.week}. ${fetchedLabel(payload.fetchedAt)}.` }),
    el(doc, "p", { text: payload.sourceDateNote || "ESPN date labels are shown only when the payload includes them." }),
    poll?.dateLabel ? el(doc, "p", { text: `ESPN date label: ${formatEspnDate(poll.dateLabel)}.` }) : null,
  ]);
  if (!poll || poll.state === "not_released") {
    return el(doc, "section", { class: "empty-card", "data-testid": "poll-missing" }, [
      head,
      el(doc, "h2", { text: `${label} not in this week` }),
      el(doc, "p", { text: poll?.reason || `${label} was not in the returned polls for this week. Another week was not copied in.` }),
    ]);
  }
  if (poll.state !== "available" || !poll.ranks.length) {
    return el(doc, "section", { class: "empty-card" }, [
      head,
      el(doc, "h2", { text: `${label} has no ranks` }),
      el(doc, "p", { text: poll?.reason || "The poll did not include ranks 1 through 25." }),
    ]);
  }
  const filtered = poll.ranks.filter((rank) => {
    if (model.session.liveOnly && !teamIsLive(snapshot, season, rank.providerId)) return false;
    if (model.session.conference === "all") return true;
    const conference = conferenceOf(snapshot, season, rank.providerId, rank.conference);
    return conference === model.session.conference;
  });
  const wrap = el(doc, "section", { "aria-label": `${label} rankings` }, [
    head,
    el(doc, "p", { class: "fine", text: `${filtered.length} returned rank${filtered.length === 1 ? "" : "s"}. Teams absent from this poll are unranked in it. Absence is not rank 26 or a receiving-votes list.` }),
  ]);
  if (!filtered.length) {
    const empty = model.session.liveOnly
      ? "No in-progress games in this snapshot, so no ranked team is marked LIVE."
      : "No ranked team in that conference is in this poll snapshot.";
    wrap.append(el(doc, "p", { class: "empty", text: empty }));
    return wrap;
  }
  const list = el(doc, "div", { class: "list", role: "list" });
  for (const rank of filtered) {
    list.append(renderTeamRow(doc, model, season, {
      providerId: rank.providerId,
      school: rank.school,
      conference: conferenceOf(snapshot, season, rank.providerId, rank.conference),
      rank: String(rank.rank),
      extra: pollExtra(rank, poll),
      recordText: rank.recordSummary,
      live: teamIsLive(snapshot, season, rank.providerId),
    }));
  }
  wrap.append(list);
  if (poll.receivingVotes?.length && !model.session.liveOnly) {
    wrap.append(el(doc, "h3", { class: "pos-label", text: "Others receiving votes" }));
    wrap.append(el(doc, "p", { class: "fine", text: "These teams are outside the top 25. They are not ranked 26 or lower." }));
    const votes = el(doc, "ul", { class: "votes" });
    for (const row of poll.receivingVotes) {
      const bits = [row.school];
      if (row.points != null) bits.push(`${row.points} pts`);
      if (row.previousRank != null) bits.push(`previous ${row.previousRank}`);
      votes.append(el(doc, "li", { text: bits.join(" · ") }));
    }
    wrap.append(votes);
  }
  if (payload.unrecognizedPolls?.length) {
    wrap.append(el(doc, "p", {
      class: "fine",
      text: `Unrecognized poll names were withheld: ${payload.unrecognizedPolls.join(", ")}.`,
    }));
  }
  return wrap;
}

function formatEspnDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function finalFlagCopy(isFinal) {
  if (isFinal === true) return "Provider marked this poll final.";
  if (isFinal === false) return "Provider marked this poll as not final.";
  return "Final-poll flag: not provided.";
}

function pollExtra(rank, poll) {
  const bits = [];
  if (poll?.pointsUsed && rank.points != null) bits.push(`${rank.points} pts`);
  if (poll?.votesUsed && rank.firstPlaceVotes != null) bits.push(`${rank.firstPlaceVotes} first-place`);
  if (rank.previousRank != null) bits.push(`previous ${rank.previousRank}`);
  else if (rank.previousUnranked) bits.push("previous not ranked");
  if (rank.trend && rank.trend !== "-") bits.push(`ESPN trend ${rank.trend}`);
  return bits.join(" · ");
}

function teamIsLive(snapshot, season, providerId) {
  return (snapshot?.games?.[season]?.games || []).some((game) => game.live && (
    String(game.home.providerId) === String(providerId) || String(game.away.providerId) === String(providerId)
  ));
}

function renderGames(doc, model, season) {
  const snapshot = model.snapshot;
  if (!snapshot || snapshot.state === "disconnected" || !snapshot.games?.[season]) {
    return emptyCard(
      doc,
      "No games stored",
      `No schedule snapshot is stored for ${season}. A connected scoreboard would show kickoff times in America/Chicago. LIVE is reserved for games ESPN marks in progress. Final games are not given a running clock.`,
    );
  }
  let games = gamesForBoard(snapshot, season, {
    phase: model.session.phase,
    week: model.session.gameWeek,
    conference: model.session.conference,
  });
  if (model.session.liveOnly) games = games.filter((game) => game.live);
  const coverage = snapshot.games[season].coverage;
  const wrap = el(doc, "section", { "aria-label": "Games" }, [
    el(doc, "p", { class: "fine", text: coverage === "complete" ? "Game coverage is marked complete for this snapshot." : "Game coverage in this snapshot is partial. Missing games are not shown as zeros." }),
  ]);
  if (!games.length) {
    const empty = model.session.liveOnly
      ? "No in-progress games in this snapshot. A final scoreboard is not marked live, and a 0:00 clock on a final game is not a live clock."
      : "No stored games match this phase, week, and conference.";
    wrap.append(el(doc, "p", { class: "empty", text: empty }));
    return wrap;
  }
  let current = null;
  let group = null;
  for (const game of games) {
    const key = `${game.week ?? "?"} · ${game.phase}`;
    if (key !== current) {
      current = key;
      group = el(doc, "section", { class: "week-group" }, [
        el(doc, "h2", { text: weekHeading(game) }),
      ]);
      wrap.append(group);
    }
    group.append(renderGameCard(doc, game, snapshot, season));
  }
  return wrap;
}

function weekHeading(game) {
  const phase = game.phase === "postseason" ? "Postseason" : game.phase === "regular" ? "Regular season" : game.phase;
  return game.week == null ? phase : `Week ${game.week} · ${phase}`;
}

function renderGameCard(doc, game, snapshot, season) {
  const homeStroke = strokeFor(conferenceOf(snapshot, season, game.home.providerId, game.home.conference));
  const awayStroke = strokeFor(conferenceOf(snapshot, season, game.away.providerId, game.away.conference));
  const card = el(doc, "article", { class: game.live ? `game-card status-${game.status} is-live` : `game-card status-${game.status}` }, [
    el(doc, "p", { class: "game-status", text: game.live ? `LIVE · ${game.clockLabel || game.statusLabel}` : game.statusLabel }),
    el(doc, "div", { class: "game-teams" }, [
      teamLine(doc, game.away, awayStroke),
      teamLine(doc, game.home, homeStroke),
    ]),
    el(doc, "p", { class: "game-meta", text: metaLine(game) }),
  ]);
  if (game.live) card.dataset.live = "true";
  return card;
}

function teamLine(doc, side, stroke) {
  const swatch = el(doc, "span", { class: stroke.dashed ? "swatch dashed" : "swatch", "aria-hidden": "true" });
  swatch.style.borderColor = stroke.color;
  swatch.style.background = stroke.dashed ? "transparent" : stroke.color;
  return el(doc, "p", { class: "side" }, [
    swatch,
    el(doc, "span", { class: "side-name", text: side.name ?? "Team unavailable" }),
    el(doc, "span", { class: "side-score", text: pointsText(side.points) }),
  ]);
}

function metaLine(game) {
  const bits = [
    game.neutralSite ? "Neutral" : "Home and away",
    game.kickoffLabel || "Kickoff time not stored",
    game.phase,
  ];
  if (game.notes) bits.push(game.notes);
  if (game.playoff?.bowlName) bits.push(game.playoff.bowlName);
  if (game.venue) bits.push(game.venue);
  return bits.join(" · ");
}

function renderTeamRow(doc, model, season, team) {
  const open = String(model.session.openTeamId) === String(team.providerId);
  const stroke = strokeFor(team.conference);
  const record = team.recordText
    ? { text: team.recordText, note: "Record summary supplied with this row." }
    : team.providerId == null
      ? { text: EM_DASH, note: "Team id missing." }
      : recordLabel(model.snapshot, season, team.providerId);
  const button = el(doc, "button", {
    type: "button",
    class: "team",
    "data-action": "toggle-team",
    "data-value": team.providerId ?? "",
    "aria-expanded": open ? "true" : "false",
  }, [
    el(doc, "span", { class: "rank", text: team.rank }),
    strokeMark(doc, stroke),
    el(doc, "span", { class: "initials", "aria-hidden": "true", text: initials(team.school) }),
    el(doc, "span", { class: "id-text" }, [
      el(doc, "span", { class: "name" }, [
        team.school || "Team unavailable",
        team.live ? el(doc, "span", { class: "live-pill", text: "LIVE" }) : null,
      ]),
      el(doc, "span", { class: "sub", text: [team.conference, team.extra].filter(Boolean).join(" · ") }),
    ]),
    el(doc, "span", { class: "record", title: record.note, text: record.text }),
    el(doc, "span", { class: open ? "arrow open" : "arrow", "aria-hidden": "true" }),
  ]);
  const entry = el(doc, "article", { class: team.live ? "entry is-live" : "entry", role: "listitem" }, [button]);
  entry.style.setProperty("--stroke", stroke.color);
  if (team.live) entry.dataset.live = "true";
  if (open) {
    entry.append(renderPanel(doc, model, season, team));
  }
  return entry;
}

function strokeMark(doc, stroke) {
  const mark = el(doc, "span", { class: stroke.dashed ? "stroke dashed" : "stroke", "aria-hidden": "true" });
  mark.style.background = stroke.dashed ? "transparent" : stroke.color;
  mark.style.borderColor = stroke.color;
  return mark;
}

function initials(school) {
  const parts = String(school || "FB").split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

function renderPanel(doc, model, season, team) {
  const tabs = el(doc, "div", { class: "tabs subtabs", role: "tablist", "aria-label": `${team.school} details` });
  for (const [value, label] of [["games", "Games"], ["roster", "Roster"], ["stats", "Stats"]]) {
    const selected = model.session.teamTab === value;
    tabs.append(el(doc, "button", {
      type: "button",
      class: "tab",
      role: "tab",
      "aria-selected": selected ? "true" : "false",
      tabindex: selected ? "0" : "-1",
      "data-action": "team-tab",
      "data-value": value,
      text: label,
    }));
  }
  const body = el(doc, "div", { class: "panel-body" });
  if (model.session.teamTab === "roster") body.append(renderRoster(doc, model, season, team));
  else if (model.session.teamTab === "stats") body.append(renderStats(doc, model, season, team));
  else body.append(renderTeamGames(doc, model, season, team));
  return el(doc, "div", { class: "panel" }, [
    el(doc, "h3", { class: "panel-title", text: `${team.school} · ${season}` }),
    tabs,
    body,
  ]);
}

function renderTeamGames(doc, model, season, team) {
  const games = gamesForTeam(model.snapshot, season, team.providerId);
  if (!games.length) {
    return el(doc, "p", { class: "empty", text: "No games for this team are in the loaded snapshot." });
  }
  const list = el(doc, "div", { class: "team-games" });
  for (const game of games) {
    const view = opponentView(game, team.providerId);
    list.append(el(doc, "article", { class: "team-game" }, [
      el(doc, "p", { class: "game-status", text: game.statusLabel }),
      el(doc, "p", { class: "name", text: `${view.outcome ? `${view.outcome} ` : ""}${view.opponent}` }),
      el(doc, "p", { class: "game-meta", text: `${view.site} · ${view.us}–${view.them} · ${game.kickoffLabel || "Time not stored"} · ${game.phase}${game.notes ? ` · ${game.notes}` : ""}` }),
    ]));
  }
  return list;
}

function renderRoster(doc, model, season, team) {
  const roster = rosterFor(model.snapshot, season, team);
  if (!roster || roster.state === "no_data" || roster.state === "season_mismatch") {
    return el(doc, "p", { class: "empty", text: roster?.reason || "Roster is not in this snapshot. Starters are not inferred from roster order." });
  }
  const wrap = el(doc, "div", {}, [
    el(doc, "p", { class: "fine", text: roster.starterReason || roster.class?.reason || "Class is shown only when ESPN supplies experience.displayValue." }),
    el(doc, "p", { class: "fine", text: roster.injuryNote || "Hometown, class, and photos are shown only when this roster included them." }),
  ]);
  for (const group of groupRoster(roster.players)) {
    wrap.append(el(doc, "h4", { class: "pos-label", text: group.label }));
    for (const player of group.players) {
      wrap.append(renderPlayer(doc, model, player));
    }
  }
  return wrap;
}

function renderPlayer(doc, model, player) {
  const open = String(model.session.openPlayerId) === String(player.providerId);
  const name = [player.firstName, player.lastName].filter(Boolean).join(" ") || "Player";
  const measured = measurement(player);
  const button = el(doc, "button", {
    type: "button",
    class: "player",
    "data-action": "toggle-player",
    "data-value": player.providerId ?? "",
    "aria-expanded": open ? "true" : "false",
  }, [
    player.headshot
      ? el(doc, "img", { class: "headshot", src: player.headshot, alt: player.headshotAlt || name })
      : el(doc, "span", { class: "initials", "aria-hidden": "true", text: initials(name) }),
    el(doc, "span", { class: "id-text" }, [
      el(doc, "span", { class: "name", text: name }),
      el(doc, "span", { class: "sub", text: [player.position, player.classLabel, measured.jersey].filter(Boolean).join(" · ") }),
    ]),
  ]);
  const row = el(doc, "div", { class: "player-row" }, [button]);
  if (open) {
    row.append(el(doc, "dl", { class: "player-detail" }, [
      detail(doc, "Jersey", measured.jersey),
      detail(doc, "Position", player.position ?? EM_DASH),
      detail(doc, "Height", player.displayHeight || measured.height),
      detail(doc, "Weight", player.displayWeight || measured.weight),
      detail(doc, "Class", player.classLabel || EM_DASH),
      detail(doc, "Hometown", player.hometown || measured.hometown),
      detail(doc, "Roster status", player.rosterStatus || EM_DASH),
    ]));
  }
  return row;
}

function detail(doc, label, value) {
  return el(doc, "div", {}, [
    el(doc, "dt", { text: label }),
    el(doc, "dd", { text: value }),
  ]);
}

function renderStats(doc, model, season, team) {
  const side = model.session.statsSide === "players" ? "players" : "team";
  const switcher = el(doc, "div", { class: "tabs subtabs", role: "tablist", "aria-label": "Stat side" });
  for (const [value, label] of [["team", "Team"], ["players", "Players"]]) {
    const selected = side === value;
    switcher.append(el(doc, "button", {
      type: "button",
      class: "tab",
      role: "tab",
      "aria-selected": selected ? "true" : "false",
      "data-action": "stats-side",
      "data-value": value,
      text: label,
    }));
  }
  const wrap = el(doc, "div", {}, [switcher]);
  if (side === "players") wrap.append(renderPlayerStats(doc, model, season, team));
  else wrap.append(renderTeamStats(doc, season, team, model.snapshot));
  return wrap;
}

function renderTeamStats(doc, season, team, snapshot) {
  const block = teamStatsFor(snapshot, season, team);
  if (block?.state === "season_mismatch") {
    return el(doc, "p", { class: "empty", text: block.reason });
  }
  if (!block || !block.stats.length) {
    return el(doc, "p", { class: "empty", text: "No team statistics are stored for this season. A response whose top-level season disagrees with the request is withheld, not shown as the year that was asked for. Missing values are not stored as zero." });
  }
  const grid = el(doc, "div", { class: "stat-grid" });
  for (const stat of block.stats) {
    grid.append(el(doc, "article", { class: stat.display == null ? "stat-tile is-na" : "stat-tile" }, [
      el(doc, "h4", { text: stat.name }),
      el(doc, "p", { class: "stat-value", text: stat.display ?? EM_DASH }),
    ]));
  }
  return el(doc, "div", {}, [
    el(doc, "p", { class: "fine", text: block.scope.label }),
    grid,
  ]);
}

function renderPlayerStats(doc, model, season, team) {
  const blocks = playerStatsFor(model.snapshot, season, team.school);
  if (!blocks.length || blocks.every((block) => !block.stats.length)) {
    return el(doc, "p", { class: "empty", text: "Player season stats are not in this snapshot. Rushing, receiving, defense, kicking, and game logs are not implied by a passing sample." });
  }
  const wrap = el(doc, "div", {});
  const present = new Set(blocks.flatMap((block) => block.categoriesPresent));
  wrap.append(el(doc, "p", { class: "fine", text: blocks[0].scope.label }));
  if (!present.has("rushing") && !present.has("receiving") && !present.has("defensive")) {
    wrap.append(el(doc, "p", { class: "fine", text: "This snapshot does not include rushing, receiving, defense, or kicking. Those categories are not shown as zeros." }));
  }
  const byPlayer = new Map();
  for (const block of blocks) {
    for (const stat of block.stats) {
      const key = String(stat.playerId ?? stat.player);
      if (!byPlayer.has(key)) byPlayer.set(key, { name: stat.player, position: stat.position, id: stat.playerId, lines: [] });
      byPlayer.get(key).lines.push(stat);
    }
  }
  for (const player of byPlayer.values()) {
    const open = String(model.session.openPlayerId) === String(player.id);
    const button = el(doc, "button", {
      type: "button",
      class: "player",
      "data-action": "toggle-player",
      "data-value": player.id ?? "",
      "aria-expanded": open ? "true" : "false",
    }, [
      el(doc, "span", { class: "name", text: player.name || "Player" }),
      el(doc, "span", { class: "sub", text: player.position || "" }),
    ]);
    const row = el(doc, "div", { class: "player-row" }, [button]);
    if (open) {
      const list = el(doc, "dl", { class: "player-detail" });
      for (const stat of player.lines) {
        list.append(detail(doc, `${stat.category || "stat"} ${stat.statType || ""}`.trim(), stat.display ?? EM_DASH));
      }
      row.append(list);
    }
    wrap.append(row);
  }
  return wrap;
}

function emptyCard(doc, title, body) {
  return el(doc, "section", { class: "empty-card" }, [
    el(doc, "h2", { text: title }),
    el(doc, "p", { text: body }),
  ]);
}

function renderFooter(doc, snapshot) {
  return el(doc, "footer", {}, [
    el(doc, "p", { text: "Independent companion. Not affiliated with ESPN, the NCAA, the College Football Playoff, conferences, or schools." }),
    el(doc, "p", { text: "Connected snapshots use ESPN’s public site API through a normalizing service. This page does not proxy the raw feed. Times use America/Chicago." }),
    el(doc, "p", { text: "Power rankings stay unavailable. The 40/30/20/10 candidate is not approved and is not shown. Official polls are separate and stop at the returned top 25." }),
    el(doc, "p", { text: "No Cloudflare resources are provisioned. The optional worker source uses a process-local 15-second cache only, which is not an account-wide request counter." }),
    el(doc, "button", {
      type: "button",
      class: "text-button",
      id: "load-fixtures",
      "data-action": "fixture",
      text: "Load captured ESPN snapshot",
    }),
  ]);
}

function renderDialog(doc, session) {
  if (session.dialog !== "methodology") return null;
  const dialog = el(doc, "div", {
    class: "dialog",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "method-title",
  }, [
    el(doc, "h2", { id: "method-title", text: "Methodology" }),
    el(doc, "p", { text: "The candidate model would blend a schedule-adjusted capped margin, smoothed FBS results, opponent strength, and last-four FBS form. The draft weights are 40, 30, 20, and 10, with a 3-point home adjustment, a 28-point margin cap, 5 pseudo-games, and 100 iterations. FCS opponents would be excluded from the model while the overall record stayed separate." }),
    el(doc, "p", { text: "Those weights are not approved, and the model is disabled. No power ranking is calculated for this screen. A team with no completed model games would be provisional at 50 rather than ranked last, but that path is not on display." }),
    el(doc, "p", { text: "Polls show only returned top-25 rows, the poll week, and the fetch time. They do not show a release date, movement, or a receiving-votes section unless a future payload actually includes them." }),
    el(doc, "label", { class: "check" }, [
      el(doc, "input", { type: "checkbox", id: "reduce-motion", "data-action": "reduce-motion" }),
      el(doc, "span", { text: "Reduce motion" }),
    ]),
    el(doc, "button", { type: "button", class: "text-button", "data-action": "close-dialog", text: "Close" }),
  ]);
  return el(doc, "div", { class: "dialog-backdrop" }, [dialog]);
}

export function syncMotionControl(root, reduceMotion) {
  const box = root.querySelector("#reduce-motion");
  if (box) box.checked = Boolean(reduceMotion);
}
