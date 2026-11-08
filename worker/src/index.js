import { createHandler } from "../../src/service/handler.js";

function platformCache() {
  const runtime = typeof caches !== "undefined" && caches.default ? caches.default : null;
  if (!runtime) {
    throw new Error("Workers Cache API is unavailable");
  }
  return {
    async match(request) {
      return runtime.match(typeof request === "string" ? request : request);
    },
    async put(request, response, ttlSeconds) {
      const headers = new Headers(response.headers);
      if (ttlSeconds) headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
      const body = await response.clone().text();
      await runtime.put(typeof request === "string" ? request : request, new Response(body, { headers }));
    },
  };
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env?.ALLOWED_ORIGIN || "";
    return createHandler({
      fetch: globalThis.fetch.bind(globalThis),
      cache: platformCache(),
      allowedOrigin,
    })(request);
  },
};
