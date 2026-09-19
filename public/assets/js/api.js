/* Banco remoto: mesma interface usada pelo resto do app
   (collection().add, collection().onSnapshot, doc().update, doc().delete),
   só que falando HTTP com /api em vez de localStorage.

   Como o app inteiro só conhece essa interface, trocar onde os dados moram
   não exige mudar telas, cálculos nem gráficos. */
(function () {
  "use strict";

  window.BancoRemoto = function (opcoes) {
    var base = String(opcoes.url || "").replace(/\/$/, "");
    var chave = opcoes.chave || "";
    var aoFalhar = opcoes.aoFalhar || function () {};

    var cache = { lancamentos: {}, compromissos: {}, metas: {} };
    var ouvintes = {};
    var carga = null;

    function pedir(metodo, caminho, corpo) {
      var cfg = { method: metodo, headers: {} };
      if (chave) cfg.headers["x-chave"] = chave;
      if (corpo) {
        cfg.headers["Content-Type"] = "application/json";
        cfg.body = JSON.stringify(corpo);
      }
      return fetch(base + caminho, cfg).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j;
          var e = new Error(j.erro || "falha na requisição");
          e.code = r.status === 401 ? "invalid_argument" : "http_" + r.status;
          throw e;
        });
      }, function () {
        var e = new Error("sem resposta do servidor");
        e.code = "rede";
        throw e;
      });
    }

    function instantaneo(colecao) {
      var docs = cache[colecao] || {};
      return {
        docs: Object.keys(docs).map(function (id) {
          return { id: id, data: function () { return docs[id]; } };
        })
      };
    }

    function avisar(colecao) {
      (ouvintes[colecao] || []).forEach(function (fn) { fn(instantaneo(colecao)); });
    }

    /* Uma carga só para as três coleções, compartilhada entre os três
       onSnapshot que o app registra na inicialização. */
    function carregar() {
      if (carga) return carga;
      carga = pedir("GET", "/dados").then(function (dados) {
        Object.keys(cache).forEach(function (col) {
          var novo = {};
          (dados[col] || []).forEach(function (item) {
            var id = item.id;
            var copia = {};
            Object.keys(item).forEach(function (k) { if (k !== "id") copia[k] = item[k]; });
            novo[id] = copia;
          });
          cache[col] = novo;
          avisar(col);
        });
      }).catch(function (e) {
        carga = null;          // permite nova tentativa depois
        aoFalhar(e);
        throw e;
      });
      return carga;
    }

    function semId(obj) {
      var copia = {};
      Object.keys(obj).forEach(function (k) { if (k !== "id") copia[k] = obj[k]; });
      return copia;
    }

    function partes(p) {
      var t = String(p).split("/");
      return { colecao: t[0], id: t.slice(1).join("/") };
    }

    return {
      collection: function (nome) {
        return {
          add: function (obj) {
            return pedir("POST", "/" + nome, obj).then(function (criado) {
              cache[nome][criado.id] = semId(criado);
              avisar(nome);
            }).catch(function (e) { aoFalhar(e); throw e; });
          },
          onSnapshot: function (aoMudar, comFalha) {
            ouvintes[nome] = ouvintes[nome] || [];
            ouvintes[nome].push(aoMudar);
            aoMudar(instantaneo(nome));          // pinta na hora com o que já há
            carregar().catch(function (e) { if (comFalha) comFalha(e); });
            return function () {
              ouvintes[nome] = (ouvintes[nome] || []).filter(function (f) {
                return f !== aoMudar;
              });
            };
          }
        };
      },

      doc: function (p) {
        var alvo = partes(p);
        return {
          update: function (campos) {
            return pedir("PATCH", "/" + alvo.colecao + "/" + alvo.id, campos)
              .then(function () {
                var atual = cache[alvo.colecao][alvo.id];
                if (atual) {
                  Object.keys(campos).forEach(function (k) { atual[k] = campos[k]; });
                  avisar(alvo.colecao);
                }
              }).catch(function (e) { aoFalhar(e); throw e; });
          },
          delete: function () {
            return pedir("DELETE", "/" + alvo.colecao + "/" + alvo.id)
              .then(function () {
                delete cache[alvo.colecao][alvo.id];
                avisar(alvo.colecao);
              }).catch(function (e) { aoFalhar(e); throw e; });
          }
        };
      }
    };
  };
})();
