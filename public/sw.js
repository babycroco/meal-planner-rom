/* Meals service worker — offline shell so the plan + grocery list stay
   readable in the supermarket with no reception.

   Strategy:
   - Navigations (index.html): network-first with cache fallback. Deploys are
     picked up immediately when online; offline serves the last-cached shell.
   - Hashed build assets (/assets/*): cache-first — content-hashed filenames
     are immutable, so a cache hit is always correct.
   - Icons / manifest: cache-first.
   - /api/*: never intercepted — generation and coach always need the network.

   Bump CACHE_VERSION only if the caching strategy itself changes; asset
   freshness is handled by hashed filenames, not by this constant. */

const CACHE_VERSION = "meals-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/favicon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Same-origin GETs only; APIs always hit the network.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network-first, cache fallback (offline shell).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Hashed assets + static files: cache-first, populate on miss.
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        }),
    ),
  );
});
