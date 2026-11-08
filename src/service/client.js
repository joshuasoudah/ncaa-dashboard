/** Browser calls for normalized views. The page never receives an ESPN URL to edit. */

export function assertApiBase(base) {
  const value = String(base || "").trim();
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_api_base");
  }
  const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  const remote = url.protocol === "https:";
  if (!local && !remote) throw new Error("invalid_api_base");
  return value.replace(/\/$/, "");
}

export function apiUrl(base, path, params = {}) {
  const root = assertApiBase(base);
  const url = new URL(`${root}/${String(path).replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

export async function getView(base, path, params, fetchImpl = fetch) {
  const response = await fetchImpl(apiUrl(base, path, params), {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}
