import captured from "../fixtures/espn/snapshot.json" with { type: "json" };
import { PREF_KEY } from "../src/config.js";
import { createRefreshLoop } from "../src/live/refresh.js";
import { acceptRenderable } from "../src/normalize/snapshot.js";
import { createSession, reopen } from "../src/ui/session.js";
import { renderApp, syncMotionControl } from "../src/ui/render.js";

const embedded = captured;
const accepted = acceptRenderable(embedded);
if (!accepted.ok || accepted.mode !== "capture") {
  throw new Error("Embedded snapshot was refused");
}

const session = createSession();
let snapshot = embedded;
let status = "Offline preview. This file has the Nov 8 public ESPN capture embedded. It does not contact ESPN or a server.";
let focusDialog = false;
const prefs = loadPrefs();
const serviceBase = null;

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
    /* file pages can block storage */
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
    serviceConnected: false,
    hidden: document.hidden,
    status,
  });
  syncMotionControl(root, resolvedMotion());
  const settings = root.querySelector("#settings");
  if (settings?.showModal && session.dialog === "settings" && !settings.open) settings.showModal();
  if (focusDialog) {
    focusDialog = false;
    root.querySelector("[data-action='close-dialog']")?.focus();
  }
  document.documentElement.dataset.viewReady = "capture";
}

function showEmbedded() {
  snapshot = embedded;
  status = "Showing the embedded Nov 8 capture. ESPN was not contacted.";
  render();
}

function onRefresh() {
  status = "Reloaded the embedded snapshot. ESPN was not contacted.";
  snapshot = embedded;
  render();
}

const refreshLoop = createRefreshLoop({
  isHidden: () => document.hidden,
  isEnabled: () => prefs.autoRefresh !== false,
  hasService: () => Boolean(serviceBase),
  onTick() {},
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
  } else if (action === "live-only") {
    session.liveOnly = !session.liveOnly;
  } else if (action === "settings") {
    session.dialog = "settings";
  } else if (action === "refresh") {
    onRefresh();
    return;
  } else if (action === "fixture") {
    showEmbedded();
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
  else if (action === "division") session.division = target.value;
  else if (action === "phase") session.phase = target.value;
  else if (action === "poll-week") session.pollWeek = target.value;
  else if (action === "game-week") session.gameWeek = target.value;
  else if (action === "auto-refresh") {
    prefs.autoRefresh = target.checked;
    savePrefs();
    render();
    return;
  } else if (action === "theme-choice") {
    prefs.theme = target.value;
    savePrefs();
    render();
    return;
  } else if (action === "reduce-motion") {
    prefs.reduceMotion = target.checked;
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
  status = "Reopened inside this file. Panels reset. The embedded capture stayed. ESPN was not contacted.";
  render();
});

const params = new URLSearchParams(location.search);
if (params.get("theme") === "light" || params.get("theme") === "dark") prefs.theme = params.get("theme");
if (params.get("view") === "games") {
  session.rankingView = "ap";
  session.openTeamId = params.get("openTeam") || "333";
  session.teamTab = "games";
} else if (params.get("view") === "rankings") session.mainTab = "rankings";
if (["power", "ap", "coaches", "cfp"].includes(params.get("view"))) {
  session.mainTab = "rankings";
  session.rankingView = params.get("view");
} else if (!params.get("view")) {
  session.rankingView = "ap";
}

render();
