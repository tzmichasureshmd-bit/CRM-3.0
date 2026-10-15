/* Tzmicha CRM — Progressive Web App service worker.
 *
 * Security model:
 *   - This worker NEVER caches private or account data.
 *   - It caches ONLY public, build-time assets: hashed bundles under
 *     /_next/static/* and the public app icons under /icons/*. These are
 *     identical for every company, so caching them cannot leak data
 *     between tenants.
 *   - API responses, Supabase calls, authentication endpoints, RSC
 *     fetches and HTML navigations are NEVER cached (network-only).
 *     When the user goes offline a static, branded offline screen is
 *     served that contains no user data.
 *
 * Upgrade policy:
 *   - The worker self-activates (skipWaiting) and claims clients so a new
 *     deploy is picked up as soon as the new worker installs. HTML is
 *     always network-first, so users are never trapped on stale code.
 */
"use strict";

var VERSION = "2026.09.24.1";
var CACHE_NAME = "tzmicha-static-" + VERSION;
var MAX_STATIC_ENTRIES = 96;

/* Inlined below: always fresh, never cached, contains no account data. */
var OFFLINE_HTML =
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Tzmicha CRM — offline</title><style>" +
  "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
  ".card{max-width:360px;padding:40px 24px;text-align:center}" +
  "img{width:72px;height:72px;border-radius:14px}" +
  "h1{font-size:18px;margin:20px 0 6px}" +
  "p{font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 24px}" +
  "button{background:#7c3aed;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer}" +
  "button:hover{background:#8b5cf6}" +
  "</style></head><body><div class=\"card\">" +
  "<img src=\"/icons/icon-192x192.png\" alt=\"\" width=\"72\" height=\"72\">" +
  "<h1>You're offline</h1>" +
  "<p>Connect to the internet to keep using Tzmicha CRM. Nothing was sent or changed.</p>" +
  "<button onclick=\"location.reload()\">Try again</button>" +
  "</div></body></html>";

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      var keys = await caches.keys();
      await Promise.all(
        keys
          .filter(function (k) {
            return k !== CACHE_NAME;
          })
          .map(function (k) {
            return caches.delete(k);
          })
      );
      await self.clients.claim();
    })()
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function trimCache(cache) {
  var keys = await cache.keys();
  var toRemove = keys.length - MAX_STATIC_ENTRIES;
  if (toRemove <= 0) return;
  await Promise.all(
    keys.slice(0, toRemove).map(function (k) {
      return cache.delete(k);
    })
  );
}

async function cacheStatic(request, cacheName) {
  var cache = await caches.open(cacheName);
  var hit = await cache.match(request);
  if (hit) return hit;
  var response;
  try {
    response = await fetch(request);
  } catch {
    return hit || Response.error();
  }
  if (response && response.ok) {
    try {
      await cache.put(request, response.clone());
      await trimCache(cache);
    } catch {
      /* ignore — cache quota exceeded, not critical */
    }
  }
  return response;
}

function offlineScreen() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  /* Supabase, Meta, Telegram and any other remote hosts — never touch. */
  if (!isSameOrigin(url)) return;

  var path = url.pathname;

  /* Private or control resources — strictly network-only. */
  if (path.startsWith("/api/")) return;
  if (path.startsWith("/auth/")) return;
  if (path === "/sw.js") return;
  if (path === "/manifest.webmanifest") return;

  /* Public build-time assets (hashed, immutable) — cache-first. */
  if (path.startsWith("/_next/static/")) {
    event.respondWith(cacheStatic(request, CACHE_NAME));
    return;
  }

  /* Public brand icons. */
  if (path.startsWith("/icons/")) {
    event.respondWith(cacheStatic(request, CACHE_NAME));
    return;
  }

  /* Navigations: network-first so users always get the latest deploy;
   * when offline, a static screen with no stored data. */
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(function () {
      return offlineScreen();
    }));
    return;
  }

  /* Everything else (RSC payloads, prefetches, images, ...) — network only. */
});