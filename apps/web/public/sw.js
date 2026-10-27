// Service worker: keeps the last loaded pages readable offline (PRD §7) and makes repeat visits fast.
//  - Pages: network first, fall back to the last copy cached on this device.
//  - Built assets (/_next/static, icons): cache first; their file names change on every release.
//  - Never cached: the ingest API, sign-in, anything that is not a same-origin GET.
// The cache is cleared on sign-out (see app/(app)/settings/sign-out.tsx).
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (![PAGES, ASSETS].includes(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(ASSETS)]));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/login")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate" || req.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    // Only keep real pages, not redirects to the sign-in screen.
    if (res.ok && !res.redirected) (await caches.open(PAGES)).put(req, res.clone());
    return res;
  } catch {
    const cached = await caches.match(req, { ignoreVary: true });
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
      "<title>Offline</title><body style='font-family:system-ui;padding:24px'><h1>You are offline</h1>" +
      "<p>This page has not been opened on this device before, so there is no saved copy. Reconnect and try again.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}
