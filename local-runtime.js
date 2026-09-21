/*
 * Sobra — motor local
 * Faz o app rodar fora do Claude (GitHub Pages, instalado no celular).
 * Imita a parte do runtime do Claude que o app usa: banco de dados e usuário.
 * Os dados ficam só neste aparelho (localStorage). IA e busca de notícias
 * não existem aqui ainda: o app já sabe funcionar sem elas.
 */
(function () {
  if (window.claude) return; // dentro do Claude, usa o runtime de verdade

  var CHAVE = "caixa.dados.v1";
  var dados = {};
  try { dados = JSON.parse(localStorage.getItem(CHAVE) || "{}") || {}; } catch (e) { dados = {}; }
  var ouvintes = {};

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function erro(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }

  function salva() {
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); return null; }
    catch (e) { return erro("quota_exceeded", "Sem espaço para salvar neste aparelho."); }
  }
  function foto(col) {
    var c = dados[col] || {};
    return { docs: Object.keys(c).map(function (id) {
      return { id: id, data: function () { return clone(c[id]); } };
    }) };
  }
  function avisa(col) {
    (ouvintes[col] || []).forEach(function (fn) { setTimeout(function () { fn(foto(col)); }, 0); });
  }
  function grava(col, mudar) {
    mudar();
    var e = salva();
    if (e) return Promise.reject(e);
    avisa(col);
    return Promise.resolve();
  }

  function documento(caminho) {
    var i = caminho.lastIndexOf("/"), col = caminho.slice(0, i), id = caminho.slice(i + 1);
    return {
      id: id,
      set: function (d) { return grava(col, function () { (dados[col] = dados[col] || {})[id] = clone(d); }); },
      update: function (d) {
        if (!dados[col] || !dados[col][id]) return Promise.reject(erro("not_found", "Registro não encontrado."));
        return grava(col, function () { Object.assign(dados[col][id], clone(d)); });
      },
      delete: function () { return grava(col, function () { if (dados[col]) delete dados[col][id]; }); },
      get: function () {
        var d = dados[col] && dados[col][id];
        return Promise.resolve({ id: id, exists: !!d, data: function () { return d ? clone(d) : undefined; } });
      }
    };
  }
  function colecao(caminho) {
    return {
      onSnapshot: function (fn) {
        (ouvintes[caminho] = ouvintes[caminho] || []).push(fn);
        setTimeout(function () { fn(foto(caminho)); }, 0);
        return function () { ouvintes[caminho] = (ouvintes[caminho] || []).filter(function (f) { return f !== fn; }); };
      },
      add: function (d) {
        var id = novoId();
        return grava(caminho, function () { (dados[caminho] = dados[caminho] || {})[id] = clone(d); })
          .then(function () { return { id: id }; });
      },
      doc: function (id) { return documento(caminho + "/" + id); }
    };
  }

  var db = { collection: colecao, doc: documento };
  var user = {
    id: function () { return Promise.resolve("local"); },
    me: function () { return Promise.resolve({ id: "local", name: "", email: null }); },
    can: function () { return Promise.resolve(true); },
    isOwner: function () { return Promise.resolve(true); },
    canEdit: function () { return Promise.resolve(true); }
  };

  window.claude = {
    local: true,
    use: function (nome) { return Promise.resolve({ db: db, user: user }[nome] || null); }
  };

  /* notícias: vêm de um endereço configurável (por padrão, o noticias.json do próprio site).
     Para usar um servidor, defina window.SOBRA_NOTICIAS_URL antes deste arquivo. */
  var URL_NOTICIAS = window.SOBRA_NOTICIAS_URL || "noticias.json";
  function carregaNoticias() {
    return fetch(URL_NOTICIAS, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw erro("server_unavailable", "HTTP " + r.status); return r.json(); })
      .then(function (resp) {
        var lista = Array.isArray(resp) ? resp : ((resp && resp.itens) || []);
        var antes = dados.noticias || {}, m = {}, novas = 0;
        lista.forEach(function (n) {
          if (!n || !n.id) return;
          if (!antes[n.id]) novas++;
          var c = clone(n); delete c.id; m[n.id] = c;
        });
        if (!lista.length) return 0;
        dados.noticias = m; salva(); avisa("noticias");
        return novas;
      });
  }
  window.claude.recarregarNoticias = carregaNoticias;
  carregaNoticias().catch(function () { /* offline: fica com as últimas notícias salvas */ });

  /* app instalável e offline */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
