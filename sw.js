// Service worker: guarda a "casca" da app para abrir offline.
// Os dados vêm sempre do Supabase (pedidos a outros domínios não são intercetados).
const V = "caderneta-v4";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest",
  "vendor/supabase.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png",
  "fonts/bricolage-grotesque-latin-600-normal.woff2",
  "fonts/bricolage-grotesque-latin-700-normal.woff2",
  "fonts/ibm-plex-mono-latin-500-normal.woff2",
  "fonts/ibm-plex-sans-latin-400-normal.woff2",
  "fonts/ibm-plex-sans-latin-500-normal.woff2",
  "fonts/ibm-plex-sans-latin-600-normal.woff2"
];

self.addEventListener("install", (e) => {
  // cache: "reload" ignora a cache HTTP do browser, para não guardar ficheiros antigos.
  e.waitUntil(caches.open(V).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" }))))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(V).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req.mode === "navigate" ? req : new Request(req, { cache: "no-cache" }))
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { net.catch(() => {}); return cached; }
      const res = await net;
      if (res) return res;
      if (req.mode === "navigate") return cache.match("index.html");
      return new Response("", { status: 504 });
    })
  );
});
