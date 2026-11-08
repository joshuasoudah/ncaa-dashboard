/** App identity and storage scope. Never share keys or cache names with the NFL board. */
export const APP_NAME = "FBS Board";
export const APP_TAGLINE = "College football companion";
export const STORAGE_PREFIX = "fbs-board-";
export const PREF_KEY = "fbs-board-prefs-v1";
export const CACHE_PREFIX = "fbs-board-";
export const SHELL_CACHE = "fbs-board-shell-v1";
export const TIME_ZONE = "America/Chicago";

/**
 * Seasons whose membership and schedule shapes were checked on the free tier.
 * These are request targets, not a hardcoded team census.
 */
export const VALIDATED_SEASONS = [2026, 2025];
export const DEFAULT_SEASON = 2026;

/** Local budget policy. This is not a provider counter and not durable across servers. */
export const LOCAL_BUDGET = Object.freeze({
  hardCeiling: 800,
  optionalCeiling: 640,
  monthlyLimitObserved: null,
  durableGlobalEnforcement: false,
});

export const FREE_PROVIDER_HOST = "api.collegefootballdata.com";

/** Paths this draft knows how to normalize. Anything else is refused. */
export const FREE_PATHS = Object.freeze([
  "/info",
  "/teams/fbs",
  "/games",
  "/rankings",
  "/roster",
  "/stats/season",
  "/stats/player/season",
]);

export const CONTRACT_VERSION = 1;
