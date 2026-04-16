const CACHE = "tasma-v5";
const ASSETS = [
  "/tasma-tracker/",
  "/tasma-tracker/index.html",
  "/tasma-tracker/manifest.json",
  "/tasma-tracker/icons/icon-192.png",
  "/tasma-tracker/icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match("/tasma-tracker/")))
  );
});
