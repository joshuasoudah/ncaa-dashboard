/**
 * Same in-progress predicate as the public NFL board (logic.js isLive).
 * College glow color is chosen by the caller. This module only classifies status.
 * displayClock on a final game is not a live clock.
 */
const LIVE_NAMES = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_HALFTIME",
  "STATUS_END_PERIOD",
  "STATUS_DELAYED",
]);

export function isLive(status) {
  const type = status?.type || {};
  return !type.completed && (type.state === "in" || LIVE_NAMES.has(type.name));
}

export function clockLabel(status) {
  if (!isLive(status)) return null;
  if (status?.displayClock && status?.period) return `Q${status.period} ${status.displayClock}`;
  return status?.type?.shortDetail || "In progress";
}

export function statusPresentation(status) {
  const type = status?.type || {};
  const name = type.name || "";
  const shortDetail = type.shortDetail || type.description || type.detail || null;
  if (/POSTPON/i.test(name) || /postpon/i.test(shortDetail || "")) {
    return { status: "postponed", statusLabel: shortDetail || "Postponed", live: false };
  }
  if (/CANCEL/i.test(name) || /cancel/i.test(shortDetail || "")) {
    return { status: "cancelled", statusLabel: shortDetail || "Cancelled", live: false };
  }
  if (isLive(status)) {
    return { status: "in_progress", statusLabel: shortDetail || "LIVE", live: true, clockLabel: clockLabel(status) };
  }
  if (type.completed && /FINAL/i.test(name)) {
    return { status: "final", statusLabel: shortDetail || "Final", live: false };
  }
  if (type.state === "pre" || /SCHEDULED/i.test(name)) {
    return { status: "scheduled", statusLabel: shortDetail || "Scheduled", live: false };
  }
  if (shortDetail) return { status: "status_unavailable", statusLabel: shortDetail, live: false };
  return { status: "status_unavailable", statusLabel: "Status unavailable", live: false };
}
