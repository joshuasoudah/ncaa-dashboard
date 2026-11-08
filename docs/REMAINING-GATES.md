# Remaining gates

These are still closed. Nothing here was deployed.

1. No scoreboard service is running. The static page cannot refresh from ESPN. `src/worker/app.js` is source only, with upstream disabled unless a test injects a transport.
2. The 15-second cache is process-local. It does not enforce Cloudflare’s 100,000 requests per account per day, and that account limit was not measured.
3. Live status handling is implemented and unit-tested with a schema example. No in-progress college game was on the November 8 scoreboard, so the clock, latency, and glow were not observed on a real live event.
4. Week 10 coverage is “63 events returned,” not a certified full FBS slate. `limit` was not a reliable page size.
5. Only Alabama’s 2026 roster was captured. Other teams say the roster is not in the snapshot. The 2025 roster was empty. Team statistics are withheld because the 2025 request came back labeled 2026.
6. Poll dates are ESPN’s labels. A week 9 request echoed week 10, so historical poll weeks still need a response whose echoed week matches the request.
7. Power-ranking weights 40/30/20/10 are not approved. The candidate function stays disabled and off the screen.
8. Headshot and logo URLs are loaded from ESPN’s CDN only inside a captured roster or row. The app icon is a plain “FB” monogram.
9. iPhone Safari, home-screen install, and the service worker on a host shared with the NFL site were not tested. The service worker only deletes caches whose names start with `fbs-board-`.
10. Publishing, a named repository, Cloudflare resources, cron, and any edit to the NFL project are still not authorized.
