const CACHE = "ola-rise-v20-khobar-food-district";
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./systems.js",
  "./live-data.js",
  "./manifest.webmanifest",
  "./assets/layer_1.jpg",
  "./assets/layer_2.jpg",
  "./assets/layer_3.jpg",
  "./assets/layer_4.jpg",
  "./assets/layer_5.jpg",
  "./assets/intro.mp3",
  "./assets/crystalised.mp3",
  "./assets/track-3.mp3",
];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((k) =>
        Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes("/generated/")) {
    e.respondWith(fetch(e.request, { cache: "no-store" }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      (r) =>
        r ||
        fetch(e.request)
          .then((resp) => {
            if (e.request.method === "GET") {
              const cp = resp.clone();
              caches.open(CACHE).then((c) => c.put(e.request, cp));
            }
            return resp;
          })
          .catch(() => r),
    ),
  );
});
