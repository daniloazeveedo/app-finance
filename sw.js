/* Sobra — service worker: abre sem internet e atualiza sozinho quando há versão nova */
var VERSAO = "sobra-v2";
var BASE = ["./", "index.html", "local-runtime.js", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(BASE); }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

function redePrimeiro(req) {
  return fetch(req).then(function (r) {
    if (r && r.ok) { var c = r.clone(); caches.open(VERSAO).then(function (cc) { cc.put(req, c); }); }
    return r;
  }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match("index.html"); }); });
}
function cachePrimeiro(req) {
  return caches.match(req).then(function (r) {
    return r || fetch(req).then(function (resp) {
      if (resp && (resp.ok || resp.type === "opaque")) {
        var c = resp.clone(); caches.open(VERSAO).then(function (cc) { cc.put(req, c); });
      }
      return resp;
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var mesmo = url.origin === self.location.origin;
  if (mesmo && (req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname) || url.pathname.endsWith("noticias.json"))) {
    e.respondWith(redePrimeiro(req));            /* página e notícias: sempre a versão mais nova */
  } else if (mesmo || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(cachePrimeiro(req));           /* scripts, ícones e fonte: do cache */
  }
});
