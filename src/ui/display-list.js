import { teamsFor } from "./select.js";

function recordParts(text) {
  const match = /^(\d+)-(\d+)(?:-(\d+))?/.exec(String(text || ""));
  if (!match) return { wins: -1, losses: 99 };
  return { wins: Number(match[1]), losses: Number(match[2]) };
}

function betterRecord(a, b) {
  const left = recordParts(a);
  const right = recordParts(b);
  if (right.wins !== left.wins) return right.wins - left.wins;
  return left.losses - right.losses;
}

function latestWeek(snapshot, season) {
  const weeks = Object.keys(snapshot?.polls?.[season] || {}).map(Number).filter((week) => week >= 1);
  if (!weeks.length) return null;
  return Math.max(...weeks);
}

function pollWeek(snapshot, season) {
  const week = latestWeek(snapshot, season);
  if (week == null) return null;
  return snapshot.polls[season][week] || snapshot.polls[season][String(week)] || null;
}

function member(snapshot, season, id) {
  return teamsFor(snapshot, season).find((team) => String(team.providerId) === String(id)) || null;
}

function recordOf(row, snapshot, season, id) {
  const fromMembership = member(snapshot, season, id)?.recordText;
  const stated = row.recordSummary || row.recordText;
  if (!stated || stated === "0-0") return fromMembership || stated || null;
  return stated;
}

/**
 * One list of at most 50 teams.
 * 1–25 follow CFP order when that poll is present, otherwise AP.
 * 26–50 continue with AP, then Coaches, then receiving votes, then best recorded wins.
 */
export function buildDisplayList(snapshot, season) {
  const week = pollWeek(snapshot, season);
  const families = week?.families || {};
  const cfpReady = families.cfp?.state === "available" && families.cfp.ranks?.length;
  const apReady = families.ap?.state === "available" && families.ap.ranks?.length;
  const topSource = cfpReady ? "cfp" : apReady ? "ap" : null;
  const top = (topSource === "cfp" ? families.cfp.ranks : families.ap?.ranks || []).slice(0, 25);
  const used = new Set();
  const rows = [];

  function add(row, sourceLabel) {
    if (rows.length >= 50) return;
    const id = row?.providerId != null ? String(row.providerId) : "";
    if (!id || used.has(id)) return;
    used.add(id);
    const team = member(snapshot, season, id);
    rows.push({
      providerId: id,
      school: row.school || team?.school || "Team",
      conference: team?.conference || row.conference || null,
      division: team?.division || null,
      logo: row.logo || team?.logo || null,
      recordText: recordOf(row, snapshot, season, id),
      previousRank: row.previousRank ?? null,
      previousUnranked: row.previousUnranked === true,
      sourceLabel,
    });
  }

  for (const row of top) add(row, topSource === "cfp" ? "CFP" : "AP");
  for (const row of families.ap?.ranks || []) add(row, "AP");
  for (const row of families.coaches?.ranks || []) add(row, "Coaches");
  const votes = [...(families.ap?.receivingVotes || []), ...(families.coaches?.receivingVotes || [])]
    .slice()
    .sort((a, b) => (b.points || 0) - (a.points || 0));
  for (const row of votes) add(row, "Receiving votes");
  const rest = teamsFor(snapshot, season)
    .slice()
    .sort((a, b) => betterRecord(a.recordText, b.recordText) || String(a.school).localeCompare(String(b.school)));
  for (const team of rest) add({ providerId: team.providerId, school: team.school, recordText: team.recordText }, "Best record");

  const capped = rows.slice(0, 50).map((row, index) => ({ ...row, rank: index + 1 }));
  const note = topSource === "cfp"
    ? `1–25 CFP${week?.week ? `, week ${week.week}` : ""}. 26–50 use AP, then Coaches, then receiving votes, then best recorded wins. Not a power ranking.`
    : topSource === "ap"
      ? `CFP was not in this week. 1–25 are AP${week?.week ? `, week ${week.week}` : ""}. 26–50 continue with Coaches, receiving votes, and best recorded wins. Not a power ranking.`
      : "No CFP or AP poll is in this snapshot.";
  return { topSource, week: week?.week ?? null, rows: capped, note };
}
