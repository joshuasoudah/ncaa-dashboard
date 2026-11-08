import { DEFAULT_SEASON, PREF_KEY } from "./src/config.js";
import { createRefreshLoop } from "./src/live/refresh.js";
import { acceptRenderable } from "./src/normalize/snapshot.js";
import { assertApiBase, getView } from "./src/service/client.js";
import { createSession, reopen, resolveSeason } from "./src/ui/session.js";
import { renderApp, syncMotionControl } from "./src/ui/render.js";

const FIXTURE_URL = new URL("./fixtures/espn/snapshot.json", import.meta.url);

function configuredBase() {
  try {
    return assertApiBase(globalThis.FBS_CONFIG?.apiBase || "");
  } catch {
    return "";
  }
}

let serviceBase = configuredBase();
const session = createSession();
let snapshot = null;
let status = "";
let bannerText = "";
let focusDialog = false;
let leftWhileHidden = false;
const prefs = loadPrefs();

function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({
      theme: prefs.theme ?? null,
      reduceMotion: prefs.reduceMotion ?? null,
      autoRefresh: prefs.autoRefresh !== false,
    }));
  } catch {
    /* Storage can be blocked. The page still works for this visit. */
  }
}

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolvedTheme() {
  return prefs.theme === "light" || prefs.theme === "dark" ? prefs.theme : systemTheme();
}

function resolvedMotion() {
  if (prefs.reduceMotion === true) return true;
  if (prefs.reduceMotion === false) return false;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function applyDocument() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.reduceMotion = resolvedMotion() ? "true" : "false";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f6f3ec" : "#14221c");
}

function render() {
  applyDocument();
  const root = document.getElementById("app");
  renderApp(root, {
    session,
    snapshot,
    theme: resolvedTheme(),
    themeChoice: prefs.theme || "system",
    reduceMotion: resolvedMotion(),
    autoRefresh: prefs.autoRefresh !== false,
    serviceConnected: Boolean(serviceBase),
    hidden: document.hidden,
    banner: bannerText,
    status,
  });
  syncMotionControl(root, resolvedMotion());
  const settings = root.querySelector("#settings");
  if (settings?.showModal && session.dialog === "settings" && !settings.open) settings.showModal();
  if (focusDialog) {
    focusDialog = false;
    root.querySelector("[data-action='close-dialog']")?.focus();
  }
  document.documentElement.dataset.viewReady = snapshot?.fixtureClass === "public-espn-capture"
    ? "capture"
    : snapshot?.synthetic
      ? "test"
      : "disconnected";
}

async function loadFixtures() {
    status = "Loading the captured ESPN snapshot stored with this draft. ESPN is not contacted.";
  render();
  try {
    const response = await fetch(FIXTURE_URL);
    if (!response.ok) throw new Error("fixture_missing");
    const payload = await response.json();
    const accepted = acceptRenderable(payload);
    if (!accepted.ok || (accepted.mode !== "capture" && accepted.mode !== "test")) {
      snapshot = null;
      status = "Refused to render an unlabeled data file.";
      render();
      return;
    }
    snapshot = payload;
    status = "Captured snapshot loaded in this tab. Reload does not contact ESPN.";
    render();
  } catch {
    snapshot = null;
    status = "Test fixtures could not be read. No scores were substituted.";
    render();
  }
}

function currentSeason() {
  return resolveSeason(session, snapshot, DEFAULT_SEASON);
}

function currentWeek() {
  if (session.pollWeek && session.pollWeek !== "latest") {
    const week = Number(session.pollWeek);
    if (week >= 1 && week <= 20) return week;
  }
  const weeks = Object.keys(snapshot?.polls?.[currentSeason()] || {}).map(Number).filter((week) => week >= 1);
  return weeks.length ? Math.max(...weeks) : 10;
}

async function onRefresh(manual = true) {
  if (!serviceBase) {
    if (!snapshot) status = "No stored snapshot. Refresh does not contact ESPN.";
    else status = snapshot.source === "fbs-board-service"
      ? "No scoreboard service is configured."
      : "Reloaded the stored snapshot. ESPN was not contacted.";
    render();
    return;
  }
  if (manual || !snapshot) status = "Checking the scoreboard service…";
  render();
  const keptTeam = session.openTeamId;
  const keptTab = session.teamTab;
  try {
    const result = await getView(serviceBase, "v1/board", {
      season: currentSeason(),
      week: currentWeek(),
      seasontype: 2,
    });
    const accepted = acceptRenderable(result.body);
    if (!result.ok || !accepted.ok || accepted.mode !== "server") {
      bannerText = "The scoreboard service did not refresh. Showing the last good snapshot.";
      if (snapshot) snapshot = { ...snapshot, state: "stale_snapshot" };
      status = "Refresh failed. This page did not invent scores.";
    } else {
      snapshot = result.body;
      session.openTeamId = keptTeam;
      session.teamTab = keptTab;
      bannerText = "";
      status = result.body.state === "stale_snapshot"
        ? "Service returned a stale snapshot. Open teams stayed open."
        : "Refreshed from the scoreboard service. Not a live clock.";
    }
  } catch {
    bannerText = "The scoreboard service could not be reached. Showing the last good snapshot.";
    if (snapshot) snapshot = { ...snapshot, state: "stale_snapshot" };
    status = "Refresh failed. This page did not invent scores.";
  }
  render();
}

async function ensureDetail(kind) {
  if (!serviceBase || !snapshot || !session.openTeamId) return;
  const season = currentSeason();
  const id = String(session.openTeamId);
  const key = `${season}:${id}`;
  if (kind === "roster" && snapshot.rosters?.[key]) return;
  if (kind === "stats" && snapshot.teamStats?.[key]) return;
  const result = await getView(serviceBase, kind === "roster" ? "v1/roster" : "v1/stats", { team: id, season });
  if (!result.ok || !result.body) {
    bannerText = kind === "roster" ? "Roster could not be loaded." : "Stats could not be loaded.";
    render();
    return;
  }
  if (kind === "roster") snapshot.rosters = { ...(snapshot.rosters || {}), [key]: result.body };
  else snapshot.teamStats = { ...(snapshot.teamStats || {}), [key]: result.body };
  bannerText = "";
  render();
}

const refreshLoop = createRefreshLoop({
  isHidden: () => document.hidden,
  isEnabled: () => prefs.autoRefresh !== false,
  hasService: () => Boolean(serviceBase),
  onTick: () => {
    if (serviceBase && !document.hidden) onRefresh(false);
  },
});

function resetPanels() {
  session.openTeamId = null;
  session.openPlayerId = null;
  session.teamTab = "games";
  session.statsSide = "team";
}

function selectGuardActive() {
  return document.activeElement?.tagName === "SELECT";
}

document.getElementById("app").addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || target.tagName === "SELECT" || target.tagName === "INPUT") return;
  const action = target.dataset.action;
  const value = target.dataset.value;
  if (action === "theme") {
    prefs.theme = resolvedTheme() === "dark" ? "light" : "dark";
    savePrefs();
  } else if (action === "live-only") {
    session.liveOnly = !session.liveOnly;
  } else if (action === "settings") {
    session.dialog = "settings";
    focusDialog = true;
  } else if (action === "refresh") {
    onRefresh();
    return;
  } else if (action === "fixture") {
    loadFixtures();
    return;
  } else if (action === "main-tab") {
    session.mainTab = value;
    resetPanels();
  } else if (action === "toggle-team") {
    const same = String(session.openTeamId) === String(value);
    resetPanels();
    session.openTeamId = same ? null : value;
  } else if (action === "team-tab") {
    session.teamTab = value;
    session.openPlayerId = null;
    render();
    if (value === "roster" || value === "stats") ensureDetail(value);
    return;
  } else if (action === "toggle-player") {
    session.openPlayerId = String(session.openPlayerId) === String(value) ? null : value;
  } else if (action === "stats-side") {
    session.statsSide = value;
    session.openPlayerId = null;
  } else if (action === "dialog") {
    session.dialog = value;
    focusDialog = true;
  } else if (action === "close-dialog") {
    session.dialog = null;
  } else {
    return;
  }
  render();
});

document.getElementById("app").addEventListener("change", (event) => {
  const target = event.target;
  const action = target.dataset.action;
  if (action === "season") session.season = target.value;
  else if (action === "ranking-view") session.rankingView = target.value;
  else if (action === "conference") session.conference = target.value;
  else if (action === "phase") session.phase = target.value;
  else if (action === "poll-week") session.pollWeek = target.value;
  else if (action === "game-week") session.gameWeek = target.value;
  else if (action === "reduce-motion") {
    prefs.reduceMotion = target.checked;
    savePrefs();
    render();
    return;
  } else if (action === "auto-refresh") {
    prefs.autoRefresh = target.checked;
    savePrefs();
    refreshLoop.start();
    render();
    return;
  } else if (action === "theme-choice") {
    prefs.theme = target.value;
    savePrefs();
    render();
    return;
  } else {
    return;
  }
  render();
});

document.getElementById("app").addEventListener("keydown", (event) => {
  if (event.key === "Escape" && session.dialog) {
    session.dialog = null;
    render();
    return;
  }
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const tab = event.target.closest?.("[role='tab']");
  if (!tab) return;
  const tabs = [...tab.closest("[role='tablist']").querySelectorAll("[role='tab']")];
  const index = tabs.indexOf(tab);
  const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
});

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  reopen(session);
  status = "Reopened. Panels, menus, and filters reset. Theme and auto-refresh were kept. ESPN was not contacted.";
  render();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    refreshLoop.stop();
    if (!selectGuardActive()) leftWhileHidden = true;
    return;
  }
  refreshLoop.start();
  const shouldReset = leftWhileHidden && !selectGuardActive();
  leftWhileHidden = false;
  if (shouldReset) reopen(session);
  render();
});

document.addEventListener("click", (event) => {
  const dialog = document.querySelector("#settings");
  if (dialog && event.target === dialog) {
    session.dialog = null;
    render();
  }
});

if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

const params = new URLSearchParams(location.search);
if (params.get("theme") === "light" || params.get("theme") === "dark") {
  prefs.theme = params.get("theme");
  savePrefs();
}
if (params.get("view") === "games") session.mainTab = "games";
if (["power", "ap", "coaches", "cfp", "fbs"].includes(params.get("view"))) {
  session.mainTab = "rankings";
  session.rankingView = params.get("view");
}

render();

const localPreview = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const boot = localPreview && (params.get("snapshot") === "captured" || params.get("fixture") === "test")
  ? loadFixtures().then(() => {
      const openTeam = params.get("openTeam");
      if (!openTeam || !snapshot) return;
      const season = snapshot.defaultSeason;
      const teams = snapshot.memberships?.[season]?.teams ?? [];
      const ranks = Object.values(snapshot.polls?.[season] ?? {}).flatMap((week) => Object.values(week.families).flatMap((family) => family.ranks ?? []));
      const known = teams.some((team) => String(team.providerId) === openTeam)
        || ranks.some((rank) => String(rank.providerId) === openTeam);
      if (!known) return;
      session.openTeamId = openTeam;
      if (params.get("teamTab") === "roster" || params.get("teamTab") === "stats" || params.get("teamTab") === "games") {
        session.teamTab = params.get("teamTab");
      }
      render();
    })
  : Promise.resolve();

window.__fbs = {
  session,
  reopen() {
    reopen(session);
    render();
  },
  boot,
};
