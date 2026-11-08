/**
 * Short in-process cache and in-flight coalescing for ESPN reads.
 * This is not a Cloudflare edge cache and not an account-wide request counter.
 */
export function createTtlCache({ now = () => Date.now(), ttlMs = 15000 } = {}) {
  const store = new Map();
  const inflight = new Map();

  async function get(key, factory) {
    const hit = store.get(key);
    if (hit && hit.expires > now()) {
      return { value: hit.value, cache: "hit", upstreamCalls: 0 };
    }
    if (inflight.has(key)) {
      const value = await inflight.get(key);
      return { value, cache: "coalesced", upstreamCalls: 0 };
    }
    let calls = 0;
    const task = Promise.resolve().then(async () => {
      calls += 1;
      return factory();
    });
    inflight.set(key, task);
    try {
      const value = await task;
      store.set(key, { value, expires: now() + ttlMs });
      return { value, cache: "miss", upstreamCalls: calls };
    } finally {
      inflight.delete(key);
    }
  }

  return {
    get,
    durableAccountQuota: false,
    note: "Process-local TTL only. Cloudflare's 100,000 requests/day are not counted here.",
  };
}
