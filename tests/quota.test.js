import test from "node:test";
import assert from "node:assert/strict";
import { createLedger } from "../src/quota/ledger.js";

const ok = (body) => async () => ({ status: 200, body });

test("ledger is process-local and does not claim global enforcement", () => {
  const ledger = createLedger();
  assert.equal(ledger.durableGlobalEnforcement, false);
  assert.equal(ledger.mode, "process_local_only");
});

test("cooldown serves last good without a second provider call", async () => {
  const ledger = createLedger();
  await ledger.run("refresh", { now: 0, cooldownMs: 1000 }, ok({ v: 1 }));
  let calls = 0;
  const second = await ledger.run("refresh", { now: 500, cooldownMs: 1000 }, async () => {
    calls += 1;
    return { status: 200, body: { v: 2 } };
  });
  assert.equal(calls, 0);
  assert.equal(second.reason, "cooldown");
  assert.deepEqual(second.lastGood, { v: 1 });
  assert.equal(second.upstreamCalls, 0);
});

test("identical concurrent purposes coalesce to one call", async () => {
  const ledger = createLedger();
  let calls = 0;
  const factory = () => new Promise((resolve) => {
    calls += 1;
    setTimeout(() => resolve({ status: 200, body: { n: calls } }), 30);
  });
  const [first, second] = await Promise.all([
    ledger.run("same", { now: 5, cooldownMs: 0 }, factory),
    ledger.run("same", { now: 5, cooldownMs: 0 }, factory),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.coalesced || second.coalesced, true);
  assert.equal(first.body.n, second.body.n);
});

test("429 does not retry and later calls stay in backoff", async () => {
  const ledger = createLedger({ backoffMs: 50 });
  await ledger.run("p", { now: 0, cooldownMs: 10 }, ok({ v: "good" }));
  let calls = 0;
  const hit = await ledger.run("p", { now: 20, cooldownMs: 10 }, async () => {
    calls += 1;
    return { status: 429, retryAfterMs: 80 };
  });
  assert.equal(calls, 1);
  assert.equal(hit.reason, "rate_limited");
  assert.equal(hit.retries, 0);
  assert.deepEqual(hit.lastGood, { v: "good" });
  const again = await ledger.run("p", { now: 30, cooldownMs: 10 }, async () => {
    calls += 1;
    return { status: 200, body: { v: "new" } };
  });
  assert.equal(again.reason, "backoff");
  assert.equal(calls, 1);
  assert.deepEqual(again.lastGood, { v: "good" });
});

test("errors fall back once and optional spend stops before the hard ceiling", async () => {
  const ledger = createLedger({ hardCeiling: 2, optionalCeiling: 1 });
  await ledger.run("req", { now: 1, cooldownMs: 0 }, ok({ v: 1 }));
  const optional = await ledger.run("hist", { now: 2, optional: true, cooldownMs: 0 }, async () => {
    throw new Error("should not spend");
  });
  assert.equal(optional.reason, "optional_budget");
  const failed = await ledger.run("req", { now: 3, cooldownMs: 0 }, async () => ({ status: 503, body: null }));
  assert.equal(failed.reason, "error");
  assert.equal(failed.retries, 0);
  assert.deepEqual(failed.lastGood, { v: 1 });
  const blocked = await ledger.run("req", { now: 4, cooldownMs: 0 }, async () => ({ status: 200, body: { v: 9 } }));
  assert.equal(blocked.reason, "hard_ceiling");
  assert.deepEqual(blocked.lastGood, { v: 1 });
  assert.equal(ledger.snapshot().used, 2);
});
