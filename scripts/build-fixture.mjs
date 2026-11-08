import fs from "node:fs";
import path from "node:path";
import { buildSnapshot } from "../src/normalize/snapshot.js";

const root = path.resolve(import.meta.dirname, "..");
const bundle = JSON.parse(fs.readFileSync(path.join(root, "fixtures/synthetic/bundle.json"), "utf8"));
if (bundle.fixtureClass !== "test-only-synthetic") {
  throw new Error("Refusing to build a fixture that is not marked test-only-synthetic");
}

const snapshot = buildSnapshot({
  synthetic: true,
  fetchedAt: bundle.fetchedAt,
  coverage: bundle.coverage,
  state: "fresh_snapshot",
  membership: bundle.membership,
  games: bundle.games,
  rankings: bundle.rankings,
  rosters: bundle.rosters,
  teamStats: bundle.teamStats,
  playerStats: bundle.playerStats,
  notices: [bundle.warning],
});

const target = path.join(root, "fixtures/synthetic/normalized-view.json");
fs.writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`wrote ${path.relative(root, target)}`);
