import { PREF_KEY } from "./src/config.js";
import { createRefreshLoop } from "./src/live/refresh.js";
import { acceptRenderable } from "./src/normalize/snapshot.js";
import { createSession, reopen } from "./src/ui/session.js";
import { renderApp, syncMotionControl } from "./src/ui/render.js";

const FIXTURE_URL = new URL("./fixtures/espn/snapshot.json", import.meta.url);
let serviceBase = null;
const session = createSession();
let snapshot = null;
let status = "";
let focusDialog = false;
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
    reduceMotion: resolvedMotion(),
    autoRefresh: prefs.autoRefresh !== false,
    status,
  });
  syncMotionControl(root, resolvedMotion());
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

function onRefresh() {
  if (serviceBase) {
    status = "A scoreboard service is configured. This draft's static server does not call ESPN from Refresh.";
  } else if (!snapshot) status = "No stored snapshot. Refresh does not contact ESPN.";
  else status = "Reloaded the stored snapshot. ESPN was not contacted.";
  render();
}

const refreshLoop = createRefreshLoop({
  isHidden: () => document.hidden,
  isEnabled: () => prefs.autoRefresh !== false,
  hasService: () => Boolean(serviceBase),
  onTick: () => {
    status = "Auto-refresh tick. No ESPN request is made without a configured service.";
    render();
  },
});

function resetPanels() {
  session.openTeamId = null;
  session.openPlayerId = null;
  session.teamTab = "games";
  session.statsSide = "team";
}

document.getElementById("app").addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target || target.tagName === "SELECT" || target.tagName === "INPUT") return;
  const action = target.dataset.action;
  const value = target.dataset.value;
  if (action === "theme") {
    prefs.theme = resolvedTheme() === "dark" ? "light" : "dark";
    savePrefs();
  } else if (action === "auto-refresh") {
    prefs.autoRefresh = prefs.autoRefresh === false;
    savePrefs();
    refreshLoop.start();
  } else if (action === "live-only") {
    session.liveOnly = !session.liveOnly;
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
  } else {
    return;
  }
  resetPanels();
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
    status = prefs.autoRefresh === false
      ? status
      : "Auto-refresh paused while this tab is hidden.";
  } else {
    refreshLoop.start();
    if (serviceBase && prefs.autoRefresh !== false) status = "Auto-refresh resumed.";
    else if (prefs.autoRefresh !== false) status = "Auto-refresh is on, and this tab is visible, but no scoreboard service is configured.";
  }
  render();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

const params = new URLSearchParams(location.search);
if (params.get("theme") === "light" || params.get("theme") === "dark") {
  prefs.theme = params.get("theme");
  savePrefs();
}
if (params.get("view") === "games") session.mainTab = "games";
if (["power", "ap", "coaches", "cfp"].includes(params.get("view"))) {
  session.mainTab = "rankings";
  session.rankingView = params.get("view");
}

render();

const boot = params.get("snapshot") === "captured" || params.get("fixture") === "test"
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
