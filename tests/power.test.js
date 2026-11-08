import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ENABLED_BY_DEFAULT,
  WEIGHTS_APPROVED,
  adjustedHomeMargin,
  experimentalCandidate,
} from "../src/power/candidate.js";

const baseGame = {
  id: 1,
  completed: true,
  neutralSite: true,
  startDate: "2026-10-01T18:00:00.000Z",
  homeId: 1,
  awayId: 2,
  homePoints: 10,
  awayPoints: 0,
};

test("candidate model stays disabled and unapproved", () => {
  assert.equal(ENABLED_BY_DEFAULT, false);
  assert.equal(WEIGHTS_APPROVED, false);
  const frozen = experimentalCandidate({
    membershipIds: [1, 2],
    games: [baseGame],
    cutoff: "2026-12-01T00:00:00.000Z",
    coverageComplete: false,
  });
  assert.equal(frozen.frozen, true);
  assert.equal(frozen.rankings, null);
  assert.equal(frozen.approved, false);
});

test("margin helper applies the home adjustment and cap", () => {
  assert.equal(adjustedHomeMargin({ homePoints: 3, awayPoints: 0, neutralSite: false }), 0);
  assert.equal(adjustedHomeMargin({ homePoints: 3, awayPoints: 0, neutralSite: true }), 3);
  assert.equal(adjustedHomeMargin({ homePoints: 100, awayPoints: 0, neutralSite: false }), 28);
  assert.equal(adjustedHomeMargin({ homePoints: null, awayPoints: 0, neutralSite: true }), null);
});

test("complete toy league is deterministic and ignores future, FCS, and duplicate games", () => {
  const games = [
    baseGame,
    { ...baseGame, id: 1, homePoints: 0, awayPoints: 80 },
    {
      id: 2,
      completed: true,
      neutralSite: true,
      startDate: "2026-11-01T18:00:00.000Z",
      homeId: 2,
      awayId: 1,
      homePoints: 100,
      awayPoints: 0,
    },
    {
      id: 3,
      completed: true,
      neutralSite: true,
      startDate: "2026-10-02T18:00:00.000Z",
      homeId: 99,
      awayId: 1,
      homePoints: 70,
      awayPoints: 0,
    },
    {
      id: 4,
      completed: true,
      neutralSite: true,
      startDate: null,
      homeId: 2,
      awayId: 1,
      homePoints: 40,
      awayPoints: 0,
    },
  ];
  const result = experimentalCandidate({
    membershipIds: [1, 2, 3],
    games,
    cutoff: "2026-10-15T00:00:00.000Z",
    coverageComplete: true,
  });
  assert.equal(result.frozen, false);
  assert.equal(result.enabledByDefault, false);
  assert.deepEqual(result.rankings.map((row) => row.providerId), [1, 2]);
  assert.ok(Math.abs(result.rankings[0].marginRating - (10 / 7)) < 1e-6);
  assert.equal(result.provisional.length, 1);
  assert.equal(result.provisional[0].providerId, 3);
  assert.equal(result.provisional[0].score, 50);
  assert.equal(result.provisional[0].rank, null);
  const again = experimentalCandidate({
    membershipIds: [1, 2, 3],
    games,
    cutoff: "2026-10-15T00:00:00.000Z",
    coverageComplete: true,
  });
  assert.deepEqual(again.rankings.map((row) => row.score), result.rankings.map((row) => row.score));
});

test("the browser shell does not import the candidate model", () => {
  for (const file of ["app.js", "src/ui/render.js", "index.html", "sw.js", "styles.css"]) {
    const text = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(text.includes("experimentalCandidate"), false, file);
    assert.equal(text.includes("collegefootballdata.com"), false, file);
    assert.equal(text.includes("nfl-prefs"), false, file);
  }
});
