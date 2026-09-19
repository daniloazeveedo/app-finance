/* Banco local: mesma API usada pelo app quando ele roda dentro do Claude
   (collection().add, doc().update, doc().delete, collection().onSnapshot).
   Aqui os dados ficam no localStorage do próprio navegador. Nada sai do aparelho. */
(function () {
  "use strict";

  window.BancoLocal = function (chave) {
    var ouvintes = {};

    function ler() {
      try {
        return JSON.parse(localStorage.getItem(chave) || "{}") || {};
      } catch (e) {
        return {};
      }
    }

    function gravar(dados) {
      try {
        localStorage.setItem(chave, JSON.stringify(dados));
        return true;
      } catch (e) {
        return false;
      }
    }

    function idNovo() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function instantaneo(colecao) {
      var docs = ler()[colecao] || {};
      return {
        docs: Object.keys(docs).map(function (id) {
          return {
            id: id,
            data: function () {
              return docs[id];
            }
          };
        })
      };
    }

    function avisar(colecao) {
      (ouvintes[colecao] || []).forEach(function (fn) {
        fn(instantaneo(colecao));
      });
    }

    // Outra aba mexeu nos dados: reemite para todas as coleções ouvidas.
    window.addEventListener("storage", function (e) {
      if (e.key !== chave) return;
      Object.keys(ouvintes).forEach(avisar);
    });

    function caminho(p) {
      var partes = String(p).split("/");
      return { colecao: partes[0], id: partes.slice(1).join("/") };
    }

    return {
      collection: function (nome) {
        return {
          add: function (obj) {
            var dados = ler();
            dados[nome] = dados[nome] || {};
            dados[nome][idNovo()] = obj;
            if (!gravar(dados)) return Promise.reject({ code: "quota_exceeded" });
            avisar(nome);
            return Promise.resolve();
          },
          onSnapshot: function (aoMudar, aoFalhar) {
            ouvintes[nome] = ouvintes[nome] || [];
            ouvintes[nome].push(aoMudar);
            try {
              aoMudar(instantaneo(nome));
            } catch (e) {
              if (aoFalhar) aoFalhar(e);
            }
            return function () {
              ouvintes[nome] = (ouvintes[nome] || []).filter(function (f) {
                return f !== aoMudar;
              });
            };
          }
        };
      },

      doc: function (p) {
        var alvo = caminho(p);
        return {
          update: function (campos) {
            var dados = ler();
            var atual = (dados[alvo.colecao] || {})[alvo.id];
            if (!atual) return Promise.reject({ code: "not_found" });
            Object.keys(campos).forEach(function (k) {
              atual[k] = campos[k];
            });
            if (!gravar(dados)) return Promise.reject({ code: "quota_exceeded" });
            avisar(alvo.colecao);
            return Promise.resolve();
          },
          delete: function () {
            var dados = ler();
            if (dados[alvo.colecao]) delete dados[alvo.colecao][alvo.id];
            if (!gravar(dados)) return Promise.reject({ code: "quota_exceeded" });
            avisar(alvo.colecao);
            return Promise.resolve();
          }
        };
      }
    };
  };
})();
