/**
 * Public GET cache. Keys are route names only — no cookies, origins, or auth.
 * A cache hit still counts as a Worker request. This does not enforce the
 * account-wide 100,000 requests/day limit.
 */
export function createTimedCache({ now = () => Date.now() } = {}) {
  const store = new Map();
  return {
    async match(request) {
      const key = cacheKey(request);
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.freshUntil != null && hit.freshUntil <= now()) return undefined;
      return new Response(hit.body, { headers: { "content-type": "application/json; charset=utf-8" } });
    },
    async put(request, response, ttlSeconds) {
      const key = cacheKey(request);
      const body = await response.clone().text();
      const previous = store.get(key);
      store.set(key, {
        body,
        freshUntil: ttlSeconds == null ? (previous?.freshUntil ?? null) : now() + ttlSeconds * 1000,
      });
    },
  };
}

export function cacheKey(request) {
  return typeof request === "string" ? request : request.url;
}

const inflight = new Map();

export async function readThrough(cache, key, ttlSeconds, load) {
  const freshKey = `https://fbs-board.cache/fresh/${key}`;
  const lastKey = `https://fbs-board.cache/last/${key}`;
  const fresh = await cache.match(freshKey);
  if (fresh) {
    return { body: await fresh.json(), cache: "hit", upstreamCalls: 0, stale: false };
  }
  if (inflight.has(key)) {
    const shared = await inflight.get(key);
    return { ...shared, cache: "coalesced", upstreamCalls: 0 };
  }
  const job = (async () => {
    let loaded;
    try {
      loaded = await load();
    } catch (error) {
      return serveLast(cache, lastKey, { upstreamCalls: 1, error: String(error?.message || error) });
    }
    if (loaded?.ok && loaded.body != null) {
      const payload = JSON.stringify(loaded.body);
      await cache.put(freshKey, new Response(payload), ttlSeconds);
      await cache.put(lastKey, new Response(payload), null);
      return { body: loaded.body, cache: "miss", upstreamCalls: 1, stale: false };
    }
    const fallback = await serveLast(cache, lastKey, { upstreamCalls: 1, errorStatus: loaded?.status || 502 });
    if (fallback.body) return fallback;
    return { body: null, cache: "error", upstreamCalls: 1, stale: false, errorStatus: loaded?.status || 502 };
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

async function serveLast(cache, lastKey, extra) {
  const last = await cache.match(lastKey);
  if (!last) return { body: null, ...extra };
  return { body: await last.json(), cache: "stale", stale: true, ...extra };
}
