/* Sobra — service worker
 * Guarda a casca do app para abrir rápido e sem internet.
 * Nunca guarda dados de login nem da conta: tudo em /api vai direto ao servidor,
 * menos as notícias, que ficam salvas para ler offline. */
var VERSAO = "sobra-v4";
var BASE = ["/", "/remote-runtime.js", "/manifest.webmanifest",
  "/icons/icon-180.png", "/icons/icon-192.png", "/icons/icon-512.png"];

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

function redePrimeiro(req, reserva) {
  return fetch(req).then(function (r) {
    if (r && r.ok && !r.redirected) { var c = r.clone(); caches.open(VERSAO).then(function (cc) { cc.put(req, c); }); }
    return r;
  }).catch(function () {
    return caches.match(req).then(function (r) { return r || (reserva ? caches.match(reserva) : undefined); });
  });
}
function cachePrimeiro(req) {
  return caches.match(req).then(function (r) {
    return r || fetch(req).then(function (resp) {
      if (resp && (resp.ok || resp.type === "opaque") && !resp.redirected) {
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
  if (mesmo && url.pathname === "/api/noticias") return e.respondWith(redePrimeiro(req));
  if (mesmo && url.pathname.indexOf("/api/") === 0) return;          /* dados e login: sempre do servidor */
  if (req.mode === "navigate") return e.respondWith(redePrimeiro(req, "/"));
  if (mesmo || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cachePrimeiro(req));
});
