/**
 * App-owned conference strokes. These are not school colors and not official marks.
 * Unknown conferences still get a named swatch from the spare palette.
 * Independents stay on the neutral token.
 */
export const CONFERENCE_STROKES = Object.freeze({
  SEC: "#8F1D2C",
  "Big Ten": "#1F4E79",
  "Big 12": "#B45309",
  ACC: "#1D4E4A",
  "Pac-12": "#2F5D50",
  American: "#9A3412",
  "Mountain West": "#3F6212",
  "Sun Belt": "#A16207",
  "Mid-American": "#6D28D9",
  "Conference USA": "#0F766E",
  Independents: "#6B6560",
});

const ALIASES = Object.freeze({
  "Southeastern Conference": "SEC",
  "Big Ten Conference": "Big Ten",
  "Big 12 Conference": "Big 12",
  "Atlantic Coast Conference": "ACC",
  "Pac-12 Conference": "Pac-12",
  "American Conference": "American",
  "American Athletic": "American",
  "Mountain West Conference": "Mountain West",
  "Sun Belt Conference": "Sun Belt",
  "Sun Belt - East": "Sun Belt",
  "Sun Belt - West": "Sun Belt",
  "Mid-American Conference": "Mid-American",
  "Conference USA": "Conference USA",
  "FBS Independents": "Independents",
  Independents: "Independents",
});

const SPARE = Object.freeze([
  "#9B2226",
  "#005F73",
  "#BB3E03",
  "#0A9396",
  "#6A4C93",
  "#3D5A40",
  "#9C6644",
  "#1D3557",
]);

export function strokeFor(conference) {
  const name = ALIASES[conference] || conference;
  if (!name || name === "Independents") {
    return { color: CONFERENCE_STROKES.Independents, dashed: true, name: "Independents" };
  }
  if (CONFERENCE_STROKES[name]) {
    return { color: CONFERENCE_STROKES[name], dashed: false, name };
  }
  const hash = [...conference].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return { color: SPARE[hash % SPARE.length], dashed: false, name: conference };
}
