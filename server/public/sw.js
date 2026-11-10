// VidSwap service worker: houdt de app-schil (HTML, logo, icons) beschikbaar zodat de app
// altijd opent, ook zonder verbinding. API-verzoeken en video's gaan nooit via de cache.
const CACHE = "vidswap-v1";
const SHELL = ["/", "/manifest.webmanifest", "/logo.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon-48.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/video" || url.pathname === "/healthz") return; // nooit cachen

  // Pagina: eerst netwerk (altijd de nieuwste versie), anders de bewaarde schil
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); return res; })
        .catch(() => caches.match("/", { ignoreSearch: true }))
    );
    return;
  }

  // Overige bestanden (icons, logo): uit de cache, op de achtergrond verversen
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
