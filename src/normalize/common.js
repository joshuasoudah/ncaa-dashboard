import { TIME_ZONE } from "../config.js";

export const EM_DASH = "—";

export function isNullish(value) {
  return value == null || value === "";
}

/** Missing stays null. Numeric zero stays zero. */
export function nullableNumber(value) {
  if (isNullish(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (text === "" || text.toLowerCase() === "null") return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

export function nullableText(value) {
  if (isNullish(value)) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatKickoff(startDate, startTimeTbd) {
  if (!startDate) return startTimeTbd ? "Time TBD" : null;
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return null;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
  if (startTimeTbd) return `${day} · Time TBD · America/Chicago`;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return `${day} · ${time}`;
}

export function formatFetchedAt(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

const PCT_TYPE = /(^|_)PCT$|PERCENT/i;

/**
 * Player stat values arrive as strings. PCT in [0, 1] is a fraction:
 * "0.673" displays as 67.3%, and "0" displays as 0.0%. Null stays null.
 */
export function interpretStat(statType, raw) {
  if (isNullish(raw)) {
    return { value: null, display: null, unit: null };
  }
  const text = String(raw).trim();
  if (text.toLowerCase() === "null") {
    return { value: null, display: null, unit: null };
  }
  const num = Number(text);
  if (!Number.isFinite(num)) {
    return { value: null, display: text, unit: "text", unparsed: true };
  }
  if (PCT_TYPE.test(statType || "")) {
    if (num >= 0 && num <= 1) {
      return {
        value: num,
        display: `${(num * 100).toFixed(1)}%`,
        unit: "percent",
        interpretedFrom: "fraction",
      };
    }
    return {
      value: num,
      display: `${trimNumber(num)}%`,
      unit: "percent",
      interpretedFrom: "already_percent",
    };
  }
  return { value: num, display: trimNumber(num), unit: "number" };
}

export function trimNumber(num) {
  if (Number.isInteger(num)) return String(num);
  return String(Math.round(num * 1000) / 1000);
}

export function formatHeight(inches) {
  if (inches == null) return null;
  const total = Number(inches);
  if (!Number.isFinite(total)) return null;
  const feet = Math.floor(total / 12);
  const rest = Math.round(total - feet * 12);
  return `${feet}'${rest}"`;
}

export function formatWeight(pounds) {
  if (pounds == null) return null;
  return `${trimNumber(Number(pounds))} lb`;
}

export function dedupeById(rows) {
  const seen = new Set();
  const kept = [];
  const dropped = [];
  for (const row of rows) {
    const id = row && row.id != null ? String(row.id) : null;
    if (id == null) {
      kept.push(row);
      continue;
    }
    if (seen.has(id)) {
      dropped.push(id);
      continue;
    }
    seen.add(id);
    kept.push(row);
  }
  return { kept, dropped };
}
