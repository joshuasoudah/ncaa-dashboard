import { LOCAL_BUDGET } from "../config.js";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function memoryStorage(initial = null) {
  let data = clone(initial);
  return {
    read() {
      return clone(data);
    },
    write(next) {
      data = clone(next);
    },
  };
}

/**
 * Process-local call budget. Concurrent identical purposes share one provider call.
 * A 429 or 5xx does not retry. Cooldown and ceiling misses return the last good body.
 * This object cannot enforce a global monthly quota until a single approved store exists.
 */
export function createLedger(options = {}) {
  const storage = options.storage ?? memoryStorage();
  const hardCeiling = options.hardCeiling ?? LOCAL_BUDGET.hardCeiling;
  const optionalCeiling = options.optionalCeiling ?? LOCAL_BUDGET.optionalCeiling;
  const defaultCooldownMs = options.cooldownMs ?? 6 * 60 * 60 * 1000;
  const defaultBackoffMs = options.backoffMs ?? 60 * 1000;
  const inflight = new Map();

  const blank = {
    used: options.initialUsed ?? 0,
    hardCeiling,
    optionalCeiling,
    cooldownUntil: {},
    backoffUntil: {},
    lastGood: {},
  };
  if (!storage.read()) storage.write(blank);

  function load() {
    return { ...blank, ...storage.read() };
  }
  function save(state) {
    storage.write(state);
  }

  async function run(purpose, runOptions, factory) {
    const now = runOptions?.now ?? Date.now();
    const optional = runOptions?.optional === true;
    const cooldownMs = runOptions?.cooldownMs ?? defaultCooldownMs;
    const state = load();
    const lastGood = state.lastGood[purpose] ?? null;

    if ((state.backoffUntil[purpose] ?? 0) > now) {
      return { ok: false, reason: "backoff", lastGood, upstreamCalls: 0, coalesced: false, retries: 0 };
    }
    if ((state.cooldownUntil[purpose] ?? 0) > now) {
      return { ok: false, reason: "cooldown", lastGood, upstreamCalls: 0, coalesced: false, retries: 0 };
    }
    if (state.used >= state.hardCeiling) {
      return { ok: false, reason: "hard_ceiling", lastGood, upstreamCalls: 0, coalesced: false, retries: 0 };
    }
    if (optional && state.used >= state.optionalCeiling) {
      return { ok: false, reason: "optional_budget", lastGood, upstreamCalls: 0, coalesced: false, retries: 0 };
    }

    if (inflight.has(purpose)) {
      const shared = await inflight.get(purpose);
      return { ...shared, coalesced: true };
    }

    const task = (async () => {
      let result;
      try {
        result = await factory();
      } catch (error) {
        const current = load();
        current.used += 1;
        save(current);
        return {
          ok: false,
          reason: "error",
          lastGood,
          upstreamCalls: 1,
          coalesced: false,
          retries: 0,
          error: error?.message || "request_failed",
        };
      }

      const status = result?.status ?? 0;
      const current = load();
      current.used += 1;
      if (status === 429) {
        const retryAfter = Number(result?.retryAfterMs);
        current.backoffUntil[purpose] = now + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : defaultBackoffMs);
        save(current);
        return {
          ok: false,
          reason: "rate_limited",
          lastGood,
          upstreamCalls: 1,
          coalesced: false,
          retries: 0,
          status,
        };
      }
      if (status < 200 || status >= 300) {
        save(current);
        return {
          ok: false,
          reason: "error",
          lastGood,
          upstreamCalls: 1,
          coalesced: false,
          retries: 0,
          status,
        };
      }
      current.lastGood[purpose] = result.body ?? null;
      current.cooldownUntil[purpose] = now + cooldownMs;
      save(current);
      return {
        ok: true,
        reason: "ok",
        body: result.body ?? null,
        lastGood: result.body ?? null,
        upstreamCalls: 1,
        coalesced: false,
        retries: 0,
        status,
      };
    })();

    inflight.set(purpose, task);
    try {
      return await task;
    } finally {
      inflight.delete(purpose);
    }
  }

  return {
    mode: "process_local_only",
    durableGlobalEnforcement: false,
    run,
    snapshot() {
      const state = load();
      return {
        used: state.used,
        hardCeiling: state.hardCeiling,
        optionalCeiling: state.optionalCeiling,
        durableGlobalEnforcement: false,
        lastGoodPurposes: Object.keys(state.lastGood),
      };
    },
  };
}
