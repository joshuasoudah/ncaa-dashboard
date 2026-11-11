import { groupRoster } from "../normalize/roster.js";
import { strokeFor } from "./conferences.js";
import { buildDisplayList } from "./display-list.js";
import { el } from "./dom.js";
import {
  EM_DASH,
  activeSeason,
  fetchedLabel,
  gamesForTeam,
  measurement,
  membershipTeam,
  playerStatsFor,
  pointsText,
  rosterFor,
  selectedPollWeek,
  teamStatsFor,
} from "./select.js";

export function renderApp(root, model) {
  const doc = root.ownerDocument;
  const season = activeSeason(model.session, model.snapshot);
  root.replaceChildren(renderShell(doc, model, season));
  syncMotionControl(root, model.reduceMotion);
  syncSettings(root, model);
}

function renderShell(doc, model, season) {
  const main = el(doc, "div", {});
  main.append(renderSticky(doc, model, season), renderList(doc, model, season), renderFooter(doc));
  return main;
}

function renderSticky(doc, model, season) {
  const snapshot = model.snapshot;
  const polling = model.autoRefresh !== false && model.serviceConnected === true && model.hidden !== true;
  const sticky = el(doc, "div", { class: "sticky" });
  sticky.append(
    el(doc, "header", { class: "scoreboard" }, [
      el(doc, "div", { class: "brand" }, [
        el(doc, "div", {}, [
          el(doc, "h1", { text: "NCAA Rankings" }),
          el(doc, "p", { id: "season", text: seasonLine(model, season) }),
          el(doc, "p", { class: "live-state", id: "live-state", "aria-label": polling ? "Automatic refresh is on" : "Snapshot only. Automatic refresh is not contacting a scoreboard." }, [
            el(doc, "span", { class: polling ? "live-dot on" : "live-dot", "aria-hidden": "true" }),
            el(doc, "span", { id: "live-label", text: polling ? "Refresh" : "Snapshot" }),
          ]),
        ]),
      ]),
      el(doc, "div", { class: "header-actions" }, [
        el(doc, "button", {
          type: "button",
          id: "theme-toggle",
          "data-action": "theme",
          text: model.theme === "light" ? "Light" : "Dark",
          "aria-label": model.theme === "light" ? "Switch to dark theme" : "Switch to light theme",
        }),
        el(doc, "button", { type: "button", id: "refresh", "data-action": "refresh", text: "Refresh now" }),
      ]),
    ]),
    el(doc, "div", { class: "status-line" }, [
      el(doc, "p", { id: "status", class: "meta", role: "status", "data-testid": snapshot?.fixtureClass === "public-espn-capture" ? "capture-banner" : "status-line", text: statusLine(model, season) }),
      el(doc, "p", { class: "meta as-of", text: snapshot?.fetchedAt ? fetchedLabel(snapshot.fetchedAt) : "" }),
    ]),
    renderBanner(doc, model),
    el(doc, "p", { id: "filter-status", text: filterStatus(model, season) }),
    el(doc, "div", { class: "head" }, [
      el(doc, "span", { text: "#" }),
      el(doc, "span", { text: "Team" }),
      el(doc, "span", { class: "record-h", text: "W-L" }),
      el(doc, "span"),
    ]),
  );
  return sticky;
}

function seasonLine(model, season) {
  const week = selectedPollWeek(model.snapshot, season, model.session.pollWeek);
  if (!model.snapshot || model.snapshot.state === "disconnected") {
    return model.serviceConnected ? "Loading" : "Not connected";
  }
  return week ? `${season} · Week ${week}` : String(season);
}

function statusLine(model, season) {
  const snapshot = model.snapshot;
  if (!snapshot || snapshot.state === "disconnected") {
    if (model.status) return model.status;
    if (model.serviceConnected) return "Checking the scoreboard service…";
    return "No snapshot is loaded. Refresh does not contact ESPN.";
  }
  const count = snapshot.memberships?.[season]?.count;
  const countText = count ? `${count} teams on the service` : "partial snapshot";
  const storedCapture = snapshot.fixtureClass === "public-espn-capture" || snapshot.synthetic === true;
  if (!storedCapture && snapshot.source === "fbs-board-service") {
    const stale = snapshot.state === "stale_snapshot" ? "Stale cached service data. " : "";
    return `${stale}Service · ${countText} · an in-progress game is shown only when ESPN marks it · a live clock was not measured`;
  }
  return `Snapshot · not a live scoreboard · ${countText}`;
}

function renderBanner(doc, model) {
  const banner = el(doc, "div", { id: "banner", class: "banner", role: "alert" });
  if (!model.banner) {
    banner.hidden = true;
    return banner;
  }
  banner.textContent = model.banner;
  return banner;
}

function filterStatus(model, season) {
  if (!model.snapshot || model.snapshot.state === "disconnected") return "";
  const rows = displayRows(model, season);
  if (!rows.length) return "";
  return rows.length === 50 ? "50 teams" : `Showing ${rows.length}`;
}

function renderList(doc, model, season) {
  const wrap = el(doc, "div", {});
  if (!model.snapshot || model.snapshot.state === "disconnected") {
    wrap.append(el(doc, "p", { id: "empty", class: "empty-state", text: "No snapshot is loaded." }));
    return wrap;
  }
  const rows = displayRows(model, season);
  if (!rows.length) {
    const text = model.session.liveOnly
      ? "No teams with an in-progress game match these filters."
      : "No CFP or AP poll is in this snapshot.";
    wrap.append(el(doc, "p", { id: "empty", class: "empty-state", text }));
    return wrap;
  }
  wrap.append(el(doc, "p", { id: "list-note", class: "meta", text: buildDisplayList(model.snapshot, season).note }));
  const list = el(doc, "div", { id: "list", role: "list", "aria-label": "College football rankings" });
  rows.forEach((row, index) => list.append(renderTeamRow(doc, model, season, row, index + 1)));
  wrap.append(list);
  return wrap;
}

function displayRows(model, season) {
  const built = buildDisplayList(model.snapshot, season);
  return built.rows.map((row) => ({
    ...row,
    extra: rowLabel(row),
    live: teamIsLive(model.snapshot, season, row.providerId),
  })).filter((row) => !model.session.liveOnly || row.live);
}

function rowLabel(row) {
  const bits = [];
  if (row.rank > 25 && row.sourceLabel) bits.push(row.sourceLabel);
  if (row.previousRank != null) bits.push(`previous ${row.previousRank}`);
  else if (row.previousUnranked) bits.push("previous not ranked");
  return bits.join(" · ");
}

function teamIsLive(snapshot, season, providerId) {
  return gamesForTeam(snapshot, season, providerId).some((game) => game.live);
}

function renderTeamRow(doc, model, season, team, rank) {
  const open = String(model.session.openTeamId) === String(team.providerId);
  const stroke = strokeFor(team.conference);
  const button = el(doc, "button", {
    type: "button",
    class: "team",
    "data-action": "toggle-team",
    "data-value": team.providerId ?? "",
    "aria-expanded": open ? "true" : "false",
  }, [
    el(doc, "span", { class: "rank", text: String(team.rank || rank) }),
    el(doc, "span", { class: "identity" }, [
      logoFrame(doc, team),
      el(doc, "span", { class: "id-text" }, [
        el(doc, "span", { class: "name-line" }, [
          el(doc, "span", { class: "name", text: team.school || "Team" }),
          team.live ? el(doc, "span", { class: "live-pill", text: "Live" }) : null,
        ]),
        el(doc, "span", { class: "sub", text: [team.conference, team.extra].filter(Boolean).join(" · ") }),
      ]),
    ]),
    el(doc, "span", { class: "record", text: team.recordText || EM_DASH }),
    el(doc, "span", { class: open ? "arrow open" : "arrow", "aria-hidden": "true" }),
  ]);
  const entry = el(doc, "section", { class: team.live ? "entry live-team" : "entry", role: "listitem" }, [button]);
  entry.style.setProperty("--stroke", stroke.color);
  if (team.live) entry.dataset.live = "true";
  if (open) entry.append(renderPanel(doc, model, season, team));
  return entry;
}

function logoFrame(doc, team) {
  const frame = el(doc, "span", { class: "logo-frame" });
  if (team.logo) {
    frame.append(el(doc, "img", { class: "team-logo", alt: "", src: team.logo, width: "36", height: "36" }));
  } else {
    frame.append(el(doc, "span", { class: "logo-fallback", "aria-hidden": "true", text: initials(team.school) }));
  }
  return frame;
}

function initials(school) {
  const parts = String(school || "FB").split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

function renderPanel(doc, model, season, team) {
  const tabs = el(doc, "div", { class: "tabs", role: "tablist", "aria-label": "Team details" });
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
  const body = el(doc, "div", { role: "tabpanel" });
  if (model.session.teamTab === "roster") body.append(renderRoster(doc, model, season, team));
  else if (model.session.teamTab === "stats") body.append(renderStats(doc, model, season, team));
  else body.append(renderTeamGames(doc, model, season, team));
  const panel = el(doc, "div", { class: "panel open" }, [el(doc, "div", { class: "panel-clip" }, [tabs, body])]);
  return panel;
}

function renderTeamGames(doc, model, season, team) {
  const games = gamesForTeam(model.snapshot, season, team.providerId);
  if (!games.length) {
    const schedule = model.snapshot?.teamSchedules?.[`${season}:${team.providerId}`];
    const text = schedule
      ? (schedule.reason || "ESPN returned no games for this season.")
      : model.serviceConnected
        ? "Checking ESPN for this team's games…"
        : "No games for this team are in the loaded snapshot.";
    return el(doc, "p", { class: "empty", text });
  }
  const byDate = (a, b) => Date.parse(a.startDate || "") - Date.parse(b.startDate || "");
  const groups = [
    ["live-sec", "IN PROGRESS", "live-title", games.filter((game) => game.live).sort(byDate), "live"],
    ["playoff-sec", "PLAYOFF GAMES", "playoff-title", games.filter((game) => game.phase === "postseason" && !game.live).sort(byDate), "playoff"],
    ["upcoming-sec", "UPCOMING REGULAR-SEASON GAMES", "upcoming-title", games.filter((game) => game.phase === "regular" && game.status !== "final" && !game.live).sort(byDate), "upcoming"],
    ["completed-sec", "COMPLETED REGULAR-SEASON GAMES", "", games.filter((game) => game.phase === "regular" && game.status === "final" && !game.live).sort((a, b) => byDate(b, a)), "completed"],
  ];
  const mount = el(doc, "div", { class: "games-mount" });
  for (const [sectionClass, title, titleClass, list, kind] of groups) {
    const body = el(doc, "div", { class: "section-body" });
    if (kind === "completed" && !list.length) {
      body.append(el(doc, "div", { class: "empty", text: "No completed regular-season games yet." }));
    } else {
      for (const game of list) body.append(renderTeamGame(doc, model, season, game, team.providerId, kind));
    }
    const section = el(doc, "div", { class: `game-section ${sectionClass}`, hidden: kind !== "completed" && !list.length }, [
      el(doc, "div", { class: titleClass ? `section-title ${titleClass}` : "section-title", text: title }),
      body,
    ]);
    mount.append(section);
  }
  return mount;
}

function markedSide(snapshot, season, side) {
  const member = membershipTeam(snapshot, season, side?.providerId);
  return {
    name: side?.name || member?.school || "Opponent unavailable",
    abbreviation: side?.abbreviation || member?.abbreviation || null,
    logo: side?.logo || member?.logo || null,
    points: side?.points ?? null,
  };
}

function resultMark(us, them) {
  if (us == null || them == null) return null;
  if (us > them) return "W";
  if (us < them) return "L";
  return "T";
}

function shortDate(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}

function kickoffClock(game) {
  if (!game.startDate) return "Kickoff TBD";
  const date = new Date(game.startDate);
  if (Number.isNaN(date.getTime())) return "Kickoff TBD";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" });
}

function scoreLogo(doc, src, className) {
  const img = el(doc, "img", {
    class: `score-logo ${className}`,
    alt: "",
    width: "15",
    height: "15",
    decoding: "async",
    loading: "lazy",
  });
  if (src && /^https?:\/\//i.test(src)) img.setAttribute("src", src);
  else img.hidden = true;
  return el(doc, "span", { class: "logo-slot" }, [img]);
}

function renderScorebox(doc, mine, theirs, result) {
  return el(doc, "span", { class: result ? "scorebox has-result" : "scorebox" }, [
    scoreLogo(doc, mine.logo, "my-logo"),
    el(doc, "span", { class: "abbr my-abbr", text: mine.abbreviation || EM_DASH }),
    el(doc, "span", { class: "pts my-pts", text: pointsText(mine.points) }),
    el(doc, "span", { class: result ? `result ${result}` : "result", text: result || "", hidden: !result }),
    scoreLogo(doc, theirs.logo, "opp-logo"),
    el(doc, "span", { class: "abbr opp-abbr", text: theirs.abbreviation || EM_DASH }),
    el(doc, "span", { class: "pts opp-pts", text: pointsText(theirs.points) }),
    el(doc, "span", { class: "result-pad", hidden: !result }),
  ]);
}

function renderTeamGame(doc, model, season, game, providerId, kind) {
  const away = String(game.away?.providerId) === String(providerId);
  const mine = markedSide(model.snapshot, season, away ? game.away : game.home);
  const theirs = markedSide(model.snapshot, season, away ? game.home : game.away);
  const completed = game.status === "final" && !game.live;
  const result = completed ? resultMark(mine.points, theirs.points) : null;
  const kindClass = kind === "playoff" ? "playoff" : kind === "upcoming" ? "upcoming" : "";
  const showScore = completed || game.live;
  const badgeText = game.live ? "● LIVE" : game.status === "scheduled" ? "SCHEDULED" : (game.statusLabel || "SCHEDULED");
  return el(doc, "div", { class: `game${kindClass ? ` ${kindClass}` : ""}${game.live ? " is-live" : ""}` }, [
    el(doc, "div", { class: "game-info" }, [
      el(doc, "div", { class: "game-line" }, [
        el(doc, "span", { class: "when", text: shortDate(game.startDate) }),
        " · ",
        el(doc, "strong", { class: "loc", text: away ? "AWAY" : "HOME" }),
        " · ",
        el(doc, "span", { class: "opp", text: `${away ? "@" : "vs"} ${theirs.name}` }),
      ]),
      el(doc, "div", { class: "game-meta round", text: game.notes || "Playoffs", hidden: kind !== "playoff" }),
    ]),
    el(doc, "div", { class: "game-score" }, [
      el(doc, "span", { class: "badge", text: badgeText, hidden: completed }),
      showScore ? renderScorebox(doc, mine, theirs, result) : el(doc, "span", { class: "scorebox", hidden: true }),
      el(doc, "div", { class: "game-meta clock", text: game.live ? (game.clockLabel || "") : kickoffClock(game), hidden: completed }),
    ]),
  ]);
}

function renderRoster(doc, model, season, team) {
  const roster = rosterFor(model.snapshot, season, team);
  if (!roster) {
    return el(doc, "p", { class: "empty", text: model.serviceConnected ? "Checking ESPN for this roster…" : "Roster is not in this snapshot." });
  }
  if (roster.state === "no_data" || roster.state === "season_mismatch" || !roster.players?.length) {
    return el(doc, "p", { class: "empty", text: roster.reason || "ESPN returned no players for this season." });
  }
  const wrap = el(doc, "div", { class: "roster-slot" }, [
    el(doc, "p", { class: "roster-source", text: "ESPN roster. Starters are not labeled." }),
  ]);
  for (const group of groupRoster(roster.players)) {
    wrap.append(el(doc, "h3", { class: "pos-label", text: group.label }));
    for (const player of group.players) wrap.append(renderPlayer(doc, model, player));
  }
  return wrap;
}

function renderPlayer(doc, model, player) {
  const open = String(model.session.openPlayerId) === String(player.providerId);
  const name = player.displayName || [player.firstName, player.lastName].filter(Boolean).join(" ") || "Player";
  const measured = measurement(player);
  const button = el(doc, "button", {
    type: "button",
    class: "player",
    "data-action": "toggle-player",
    "data-value": player.providerId ?? "",
    "aria-expanded": open ? "true" : "false",
  }, [
    player.headshot
      ? el(doc, "img", { class: "headshot", src: player.headshot, alt: "" })
      : el(doc, "span", { class: "headshot-fallback", "aria-hidden": "true", text: initials(name) }),
    el(doc, "span", { class: "id-text" }, [
      el(doc, "span", { class: "player-name", text: name }),
      el(doc, "span", { class: "meta-chip", text: [player.position, player.classLabel, measured.jersey].filter(Boolean).join(" · ") }),
    ]),
  ]);
  const row = el(doc, "div", {}, [button]);
  if (open) {
    row.append(el(doc, "dl", { class: "player-detail" }, [
      detail(doc, "Class", player.classLabel || EM_DASH),
      detail(doc, "Height", player.displayHeight || measured.height),
      detail(doc, "Weight", player.displayWeight || measured.weight),
      detail(doc, "Hometown", player.hometown || measured.hometown),
    ]));
  }
  return row;
}

function detail(doc, label, value) {
  return el(doc, "div", {}, [
    el(doc, "dt", { text: label }),
    el(doc, "dd", { text: value || EM_DASH }),
  ]);
}

function renderStats(doc, model, season, team) {
  const block = teamStatsFor(model.snapshot, season, team);
  if (block?.state === "season_mismatch") return el(doc, "p", { class: "empty", text: block.reason });
  const side = model.session.statsSide === "players" ? "players" : "team";
  const tabs = el(doc, "div", { class: "tabs", role: "tablist", "aria-label": "Stat side" });
  for (const [value, label] of [["team", "Team"], ["players", "Players"]]) {
    const selected = side === value;
    tabs.append(el(doc, "button", {
      type: "button",
      class: "tab",
      role: "tab",
      "aria-selected": selected ? "true" : "false",
      "data-action": "stats-side",
      "data-value": value,
      text: label,
    }));
  }
  const wrap = el(doc, "div", { class: "stats-slot" }, [tabs]);
  if (side === "players") {
    const blocks = playerStatsFor(model.snapshot, season, team.school);
    wrap.append(el(doc, "p", { class: "empty", text: blocks.length ? "Player stats in this snapshot are listed below." : "Player stats are not in this snapshot." }));
    return wrap;
  }
  if (!block?.stats?.length) {
    const text = block?.reason
      || (model.serviceConnected && !block ? "Checking ESPN for this team's stats…" : "ESPN returned no season stats for this team.");
    wrap.append(el(doc, "p", { class: "empty", text }));
    return wrap;
  }
  const grid = el(doc, "div", { class: "stat-grid" });
  for (const stat of block.stats) {
    grid.append(el(doc, "article", { class: stat.display == null ? "stat-tile is-na" : "stat-tile" }, [
      el(doc, "h4", { class: "stat-label", text: stat.name }),
      el(doc, "p", { class: "stat-value", text: stat.display ?? EM_DASH }),
    ]));
  }
  wrap.append(el(doc, "p", { class: "stats-meta", text: block.scope?.label || "" }), grid);
  return wrap;
}

function renderFooter(doc) {
  return el(doc, "footer", {}, [
    el(doc, "p", { text: "Ranks 1–25 follow the CFP poll when ESPN has it, otherwise AP. Ranks 26–50 are labeled AP, Coaches, receiving votes, or best record. Power rankings are not available." }),
    el(doc, "p", {}, [
      "Data is unofficial and comes from ",
      el(doc, "a", { href: "https://www.espn.com/college-football/", rel: "noopener noreferrer", text: "ESPN" }),
      ". This app is not affiliated with ESPN, the NCAA, or the schools.",
    ]),
  ]);
}

function renderSettings(doc, model) {
  if (model.session.dialog !== "settings") return null;
  const notes = (model.snapshot?.notices || []).filter(Boolean);
  const dialog = el(doc, "dialog", { id: "settings", "aria-labelledby": "settings-title" });
  dialog.append(
    el(doc, "h2", { id: "settings-title", text: "Settings" }),
    el(doc, "label", { class: "settings-row" }, [
      el(doc, "input", { type: "checkbox", id: "auto-refresh", "data-action": "auto-refresh" }),
      " Auto-refresh while this tab is open",
    ]),
    el(doc, "fieldset", {}, [
      el(doc, "legend", { text: "Theme" }),
      themeChoice(doc, "system", "Match system"),
      themeChoice(doc, "light", "Light"),
      themeChoice(doc, "dark", "Dark"),
    ]),
    el(doc, "p", { class: "game-meta", text: model.serviceConnected
      ? "Auto-refresh calls the scoreboard service while this tab is visible and pauses while it is hidden. Refresh keeps the open team. Reopening closes teams, player details, and this dialog, and sets filters back to All. A cached row is not a live clock."
      : "Auto-refresh is saved with the theme. This page has no scoreboard service, so refresh reads the stored snapshot and does not contact ESPN. It pauses while the tab is hidden. Reopening closes teams, player details, and this dialog, and sets filters back to All." }),
    el(doc, "details", {}, [
      el(doc, "summary", { text: "Snapshot notes" }),
      el(doc, "p", { class: "game-meta", text: "The loaded file is a November 8 public capture. Every game in that scoreboard was final, so no live clock was observed. Conference color is the thin stripe on a team. A glow uses that same color only for an in-progress status." }),
      notes.length ? el(doc, "ul", { class: "votes" }, notes.map((note) => el(doc, "li", { text: note }))) : null,
      el(doc, "p", { class: "game-meta", "data-testid": "power-unavailable", text: "Power rankings stay unavailable. Preliminary weights of 40, 30, 20, and 10 are not approved." }),
    ]),
    el(doc, "div", { class: "settings-actions" }, [
      el(doc, "button", { type: "button", class: "settings-close", "data-action": "close-dialog", text: "Close" }),
    ]),
    el(doc, "p", {}, [
      el(doc, "button", { type: "button", class: "text-button", id: "load-fixtures", "data-action": "fixture", text: "Load captured snapshot" }),
    ]),
  );
  return dialog;
}

function themeChoice(doc, value, label) {
  return el(doc, "label", { class: "choice" }, [
    el(doc, "input", { type: "radio", name: "theme-choice", "data-action": "theme-choice", value }),
    ` ${label}`,
  ]);
}

export function syncMotionControl(root, reduceMotion) {
  const box = root.querySelector("#reduce-motion");
  if (box) box.checked = Boolean(reduceMotion);
}

export function syncSettings(root, model) {
  const auto = root.querySelector("#auto-refresh");
  if (auto) auto.checked = model.autoRefresh !== false;
  const theme = model.themeChoice || (model.theme === "light" || model.theme === "dark" ? model.theme : "system");
  for (const input of root.querySelectorAll('input[data-action="theme-choice"]')) {
    input.checked = input.value === theme;
  }
}
