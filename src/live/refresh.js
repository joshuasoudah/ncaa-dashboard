/**
 * Visible polling gate. Hidden tabs and a missing service do not call upstream.
 * The interval is owned by the caller. Tests use tick() instead of waiting.
 */
export function createRefreshLoop({
  isHidden = () => false,
  isEnabled = () => false,
  hasService = () => false,
  onTick = () => {},
  intervalMs = 60000,
  schedule = (fn, ms) => setInterval(fn, ms),
  clear = (id) => clearInterval(id),
} = {}) {
  let timer = null;

  function state() {
    if (!hasService()) return "no-service";
    if (!isEnabled()) return "disabled";
    if (isHidden()) return "hidden";
    return "running";
  }

  function stop() {
    if (timer != null) clear(timer);
    timer = null;
  }

  function start() {
    stop();
    if (state() !== "running") return state();
    timer = schedule(() => {
      if (state() === "running") onTick();
    }, intervalMs);
    return "running";
  }

  return {
    start,
    stop,
    state,
    tick() {
      if (state() !== "running") return state();
      onTick();
      return "running";
    },
  };
}
