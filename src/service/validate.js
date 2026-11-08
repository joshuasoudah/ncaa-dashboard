/** Query checks for the college board. Team ids are not capped at 32 or 34. */

export function parseSeason(value) {
  if (!/^\d{4}$/.test(String(value ?? ""))) return null;
  const year = Number(value);
  if (year < 2000 || year > 2100) return null;
  return year;
}

export function parseWeek(value) {
  if (!/^\d{1,2}$/.test(String(value ?? ""))) return null;
  const week = Number(value);
  if (week < 1 || week > 20) return null;
  return week;
}

export function parseSeasonType(value, fallback = 2) {
  if (value == null || value === "") return fallback;
  if (!/^[123]$/.test(String(value))) return null;
  return Number(value);
}

export function parseTeamId(value) {
  if (!/^\d{1,6}$/.test(String(value ?? ""))) return null;
  return String(value);
}
