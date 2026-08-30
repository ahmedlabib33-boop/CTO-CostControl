self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("ola-rise-")).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const request = new Request(e.request, { cache: "no-store" });
  if (new URL(e.request.url).origin === self.location.origin) {
    e.respondWith(fetch(request));
    return;
  }
});
