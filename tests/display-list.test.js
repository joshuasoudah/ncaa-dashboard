import test from "node:test";
import assert from "node:assert/strict";
import { buildDisplayList } from "../src/ui/display-list.js";

function rank(rank, id, school, record) {
  return { rank, providerId: String(id), school, recordSummary: record, conference: "Sample" };
}

function snapshot(extra = {}) {
  const teams = [];
  for (let i = 1; i <= 60; i += 1) {
    teams.push({
      providerId: String(i),
      school: `Team ${i}`,
      conference: "Sample",
      recordText: `${60 - i}-1`,
    });
  }
  return {
    memberships: { 2026: { teams } },
    polls: {
      2026: {
        11: {
          week: 11,
          families: {
            cfp: {
              state: "available",
              ranks: [
                rank(1, 61, "Georgia Bulldogs", "8-1"),
                rank(2, 254, "Utah Utes", "9-0"),
                rank(3, 333, "Alabama Crimson Tide", "7-2"),
                rank(4, 26, "UCLA Bruins", "9-0"),
                rank(5, 87, "Notre Dame Fighting Irish", "8-1"),
              ],
            },
            ap: {
              state: "available",
              ranks: [rank(1, 61, "Georgia Bulldogs", "8-1"), rank(2, 99, "LSU Tigers", "7-2")],
              receivingVotes: [rank(null, 80, "Vote School", "0-0")],
            },
            coaches: {
              state: "available",
              ranks: [rank(1, 70, "Coach School", "6-3")],
              receivingVotes: [rank(null, 71, "Coach Vote", "5-4")],
            },
          },
        },
      },
    },
    ...extra,
  };
}

test("the main list follows CFP order and stops at 50", () => {
  const list = buildDisplayList(snapshot(), 2026);
  assert.equal(list.topSource, "cfp");
  assert.equal(list.rows.length, 50);
  assert.deepEqual(list.rows.slice(0, 5).map((row) => row.school), [
    "Georgia Bulldogs",
    "Utah Utes",
    "Alabama Crimson Tide",
    "UCLA Bruins",
    "Notre Dame Fighting Irish",
  ]);
  assert.deepEqual(list.rows.slice(0, 5).map((row) => row.recordText), ["8-1", "9-0", "7-2", "9-0", "8-1"]);
  assert.equal(list.rows.some((row) => row.rank > 50), false);
  assert.equal(list.rows[25].sourceLabel === "AP" || list.rows[25].sourceLabel === "Coaches" || list.rows[25].sourceLabel === "Receiving votes" || list.rows[25].sourceLabel === "Best record", true);
  assert.match(list.note, /1–25 CFP/);
  assert.match(list.note, /Not a power ranking/);
  assert.equal(list.note.includes("40"), false);
});

test("AP fills the top 25 only when CFP is missing", () => {
  const data = snapshot();
  data.polls[2026][11].families.cfp = { state: "not_released", ranks: [] };
  const list = buildDisplayList(data, 2026);
  assert.equal(list.topSource, "ap");
  assert.equal(list.rows[0].school, "Georgia Bulldogs");
  assert.equal(list.rows[1].school, "LSU Tigers");
  assert.match(list.note, /CFP was not in this week/);
  assert.equal(list.rows.length, 50);
});

test("a 0-0 receiving-vote record uses the membership record", () => {
  const data = snapshot();
  data.memberships[2026].teams.push({ providerId: "80", school: "Vote School", recordText: "6-4", conference: "Sample" });
  const list = buildDisplayList(data, 2026);
  const vote = list.rows.find((row) => row.school === "Vote School");
  assert.equal(vote.recordText, "6-4");
  assert.equal(vote.sourceLabel, "Receiving votes");
});
