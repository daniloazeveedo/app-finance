/*
 * Fôlego — motor remoto
 * Faz o app rodar na Vercel com login e dados na nuvem (Neon).
 * Imita a parte do runtime do Claude que o app usa (banco, usuário e IA),
 * então as telas não precisam saber onde os dados moram.
 *
 *   /api/auth/*    login, cadastro, sessão
 *   /api/docs      dados de cada pessoa
 *   /api/agente    IA (a chave fica no servidor)
 *   /api/noticias  aba news
 */
(function () {
  "use strict";
  if (window.claude) return; // dentro do Claude, usa o runtime de verdade

  var API = "/api";
  var usuario = null;          // { id, nome, email }
  var dados = {};              // { colecao: { id: doc } }
  var ouvintes = {};           // { colecao: [fn] }
  var ultimaCarga = 0;
  var prontoResolve, pronto = new Promise(function (r) { prontoResolve = r; });

  /* ---------------- utilidades ---------------- */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function erro(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }

  function pedir(metodo, caminho, corpo) {
    var cfg = { method: metodo, credentials: "same-origin", headers: {} };
    if (corpo) { cfg.headers["Content-Type"] = "application/json"; cfg.body = JSON.stringify(corpo); }
    return fetch(API + caminho, cfg).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) return j;
        if (r.status === 401 && usuario) mostraAcesso("Sua sessão expirou. Entre de novo.");
        var codigo = r.status === 401 ? "invalid_argument" : r.status === 413 ? "quota_exceeded"
          : r.status === 404 ? "not_found" : "unavailable";
        throw erro(codigo, j.erro || "falha no servidor");
      });
    }, function () { throw erro("unavailable", "sem conexão com o servidor"); });
  }

  /* ---------------- dados ---------------- */
  var CHAVE_NOTICIAS = "sobra.noticias.v1";
  var noticias = {};
  try { noticias = JSON.parse(localStorage.getItem(CHAVE_NOTICIAS) || "{}") || {}; } catch (e) { noticias = {}; }

  function foto(col) {
    var c = col === "noticias" ? noticias : (dados[col] || {});
    return { docs: Object.keys(c).map(function (id) {
      return { id: id, data: function () { return clone(c[id]); } };
    }) };
  }
  function avisa(col) {
    (ouvintes[col] || []).forEach(function (fn) { setTimeout(function () { fn(foto(col)); }, 0); });
  }
  function avisaTudo() { Object.keys(ouvintes).forEach(avisa); }

  /* O app usa caminhos como "data/users/<id>/perfil/lancamentos".
     Aqui só importa o nome da coleção: o dono é sempre quem está logado. */
  function colecaoDe(caminho) { var p = String(caminho).split("/"); return p[p.length - 1]; }

  function carrega() {
    return pedir("GET", "/docs").then(function (j) {
      dados = (j && j.colecoes) || {};
      ultimaCarga = Date.now();
      avisaTudo();
    });
  }

  function grava(op, col, id, doc) {
    return pedir("POST", "/docs", { op: op, colecao: col, id: id, dados: doc }).then(function () {
      var c = dados[col] = dados[col] || {};
      if (op === "delete") delete c[id];
      else if (op === "set") c[id] = clone(doc);
      else c[id] = Object.assign(c[id] || {}, clone(doc));
      avisa(col);
    });
  }

  function documento(caminho) {
    var i = caminho.lastIndexOf("/"), col = colecaoDe(caminho.slice(0, i)), id = caminho.slice(i + 1);
    return {
      id: id,
      set: function (d) { return grava("set", col, id, d); },
      update: function (d) { return grava("update", col, id, d); },
      delete: function () { return grava("delete", col, id); },
      get: function () {
        var d = dados[col] && dados[col][id];
        return Promise.resolve({ id: id, exists: !!d, data: function () { return d ? clone(d) : undefined; } });
      }
    };
  }
  function colecao(caminho) {
    var col = colecaoDe(caminho);
    return {
      onSnapshot: function (fn) {
        (ouvintes[col] = ouvintes[col] || []).push(fn);
        setTimeout(function () { fn(foto(col)); }, 0);
        return function () { ouvintes[col] = (ouvintes[col] || []).filter(function (f) { return f !== fn; }); };
      },
      add: function (d) {
        var id = novoId();
        return grava("set", col, id, d).then(function () { return { id: id }; });
      },
      doc: function (id) { return documento(caminho + "/" + id); }
    };
  }
  var db = { collection: colecao, doc: documento };

  /* volta do segundo plano: busca o que mudou em outro aparelho */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && usuario && Date.now() - ultimaCarga > 30000) {
      carrega().catch(function () {});
    }
  });

  /* ---------------- notícias ---------------- */
  function recarregarNoticias() {
    return fetch(API + "/noticias", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw erro("server_unavailable"); return r.json(); })
      .then(function (resp) {
        var lista = Array.isArray(resp) ? resp : ((resp && resp.itens) || []);
        var novas = 0, limite = Date.now() - 21 * 86400000;
        lista.forEach(function (n) {
          if (!n || !n.id) return;
          var c = clone(n); delete c.id;
          if (noticias[n.id]) c.entrou = noticias[n.id].entrou || c.entrou; else novas++;
          noticias[n.id] = c;
        });
        Object.keys(noticias).forEach(function (id) {
          var t = new Date(noticias[id].quando || noticias[id].entrou).getTime();
          if (!isNaN(t) && t < limite) delete noticias[id];
        });
        try { localStorage.setItem(CHAVE_NOTICIAS, JSON.stringify(noticias)); } catch (e) {}
        avisa("noticias");
        return novas;
      });
  }

  /* ---------------- IA (pela rota /api/agente) ---------------- */
  function amostra(entrada, opcoes) {
    opcoes = opcoes || {};
    var brutas = typeof entrada === "string" ? [{ role: "user", content: entrada }] : (entrada || []);
    var msgs = [];
    brutas.forEach(function (m) {
      var papel = m && m.role === "assistant" ? "assistant" : "user";
      var texto = typeof (m && m.content) === "string" ? m.content : "";
      if (!texto) return;
      var ult = msgs[msgs.length - 1];
      if (ult && ult.role === papel) ult.content += "\n\n" + texto; // a API quer papéis alternados
      else msgs.push({ role: papel, content: texto });
    });
    if (msgs.length && msgs[0].role !== "user") msgs.unshift({ role: "user", content: "Olá." });
    return fetch(API + "/agente", {
      method: "POST", credentials: "same-origin", signal: opcoes.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs.slice(-20) })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok) {
          var res = { text: j.text || "" };
          if (opcoes.onText) opcoes.onText(res);
          return res;
        }
        var code = r.status === 429 ? "rate_limited" : r.status === 401 ? "not_granted"
          : r.status === 503 ? "sampling_disabled" : "upstream_error";
        throw { code: code, text: "" };
      });
    }, function (e) {
      throw { code: e && e.name === "AbortError" ? "cancelled" : "upstream_error", text: "" };
    });
  }
  amostra.json = function (entrada, opcoes) {
    return amostra(entrada, opcoes).then(function (r) {
      var t = r.text || "", a = t.indexOf("{"), b = t.lastIndexOf("}");
      if (a < 0 || b < a) throw { code: "invalid_output", text: t };
      return JSON.parse(t.slice(a, b + 1));
    });
  };
  amostra.limits = function () { return Promise.resolve({ images: null }); };

  /* ---------------- usuário ---------------- */
  var user = {
    id: function () { return pronto.then(function () { return usuario.id; }); },
    me: function () { return pronto.then(function () { return { id: usuario.id, name: usuario.nome, email: usuario.email }; }); },
    can: function () { return Promise.resolve(true); },
    isOwner: function () { return Promise.resolve(true); },
    canEdit: function () { return Promise.resolve(true); }
  };

  function sair() {
    return pedir("POST", "/auth/sair").catch(function () {}).then(function () {
      try { localStorage.removeItem(CHAVE_NOTICIAS); } catch (e) {}
      location.reload();
    });
  }

  window.claude = {
    remoto: true,
    recarregarNoticias: recarregarNoticias,
    sair: sair,
    email: function () { return usuario ? usuario.email : ""; },
    use: function (nome) {
      if (nome === "db") return pronto.then(function () { return db; });
      if (nome === "user") return pronto.then(function () { return user; });
      if (nome === "sample") return pronto.then(function () { return amostra; });
      return Promise.resolve(null); // mcp e demais não existem aqui
    }
  };

  /* ---------------- tela de acesso ---------------- */
  var CSS =
    ".acesso{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;" +
    "padding:24px;background:var(--preto,#14131C);overflow-y:auto}" +
    ".acessoCaixa{width:100%;max-width:380px}" +
    ".acessoMarca{display:flex;align-items:center;gap:12px;margin-bottom:10px}" +
    ".acessoMarca .icone{width:52px;height:52px;border-radius:15px;display:grid;place-items:center;" +
    "background:linear-gradient(135deg,var(--amarelo,#8C80E6),var(--amarelo2,#A79CF0))}" +
    ".acessoMarca .icone svg{width:34px;height:34px}" +
    ".acessoMarca b{font-size:34px;font-weight:800;letter-spacing:-.04em;color:var(--texto,#F3F1FA)}" +
    ".acessoLema{color:var(--cinza,#918CA6);font-size:14.5px;line-height:1.5;margin:0 0 26px}" +
    ".acessoAbas{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--cartao2,#272336);margin-bottom:18px}" +
    ".acessoAbas button{flex:1;border:0;background:none;border-radius:11px;padding:11px;font:inherit;" +
    "font-size:14.5px;font-weight:700;color:var(--cinza,#918CA6)}" +
    ".acessoAbas button.on{background:var(--cartao,#1E1C2A);color:var(--texto,#F3F1FA);box-shadow:0 1px 3px rgba(0,0,0,.2)}" +
    ".acessoCampo{display:block;font-size:13px;color:var(--cinza,#918CA6);margin-bottom:14px}" +
    ".acessoCampo input{display:block;width:100%;margin-top:6px;padding:14px 15px;border-radius:13px;font:inherit;" +
    "font-size:16px;color:var(--texto,#F3F1FA);background:var(--cartao,#1E1C2A);border:1px solid var(--linha,#332F47)}" +
    ".acessoCampo input:focus{outline:2px solid var(--acento,#8C80E6);outline-offset:1px}" +
    ".acessoErro{min-height:20px;margin:0 0 10px;font-size:13.5px;color:var(--vermelho,#F86A6A)}" +
    ".acessoBtn{width:100%;border:0;border-radius:14px;padding:15px;font:inherit;font-size:15.5px;font-weight:800;" +
    "color:#1E1C2A;background:linear-gradient(100deg,var(--amarelo,#8C80E6),var(--amarelo2,#A79CF0))}" +
    ".acessoBtn:disabled{opacity:.6}" +
    ".acessoNota{margin-top:18px;font-size:12.5px;line-height:1.5;color:var(--cinza,#918CA6);text-align:center}" +
    ".acessoCarregando{color:var(--cinza,#918CA6);font-size:14px;text-align:center}";
  var MARCA = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="34" fill="none" stroke="#1E1C2A" stroke-width="9"/>' +
    '<path d="M29 55 C36 40, 44 40, 50 50 S 64 60, 71 45" fill="none" stroke="#1E1C2A" ' +
    'stroke-width="9" stroke-linecap="round"/></svg>';
  var modo = "entrar", caixa = null;

  function monta() {
    if (caixa) return caixa;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    caixa = document.createElement("div");
    caixa.className = "acesso"; caixa.id = "acessoSobra";
    caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-modal", "true"); caixa.setAttribute("aria-labelledby", "acessoTit");
    caixa.innerHTML =
      '<div class="acessoCaixa">' +
      '<div class="acessoMarca"><span class="icone">' + MARCA + '</span><b id="acessoTit">fôlego</b></div>' +
      '<p class="acessoLema">Ganhe fôlego no fim do mês: veja o que entra, o que já tem dono e o que sobra.</p>' +
      '<div id="acessoCorpo"><p class="acessoCarregando">Abrindo\u2026</p></div></div>';
    document.body.appendChild(caixa);
    return caixa;
  }
  function formulario(msg) {
    var criar = modo === "criar";
    document.getElementById("acessoCorpo").innerHTML =
      '<div class="acessoAbas" role="tablist">' +
      '<button type="button" role="tab" data-modo="entrar" class="' + (criar ? "" : "on") + '" aria-selected="' + !criar + '">Entrar</button>' +
      '<button type="button" role="tab" data-modo="criar" class="' + (criar ? "on" : "") + '" aria-selected="' + criar + '">Criar conta</button></div>' +
      '<form id="acessoForm" novalidate>' +
      (criar ? '<label class="acessoCampo">Como quer ser chamado<input id="acessoNome" autocomplete="given-name" maxlength="80" required></label>' : '') +
      '<label class="acessoCampo">E-mail<input id="acessoEmail" type="email" inputmode="email" autocomplete="email" required></label>' +
      '<label class="acessoCampo">Senha<input id="acessoSenha" type="password" autocomplete="' + (criar ? "new-password" : "current-password") + '" required></label>' +
      '<p class="acessoErro" id="acessoErro" role="alert">' + (msg || "") + '</p>' +
      '<button class="acessoBtn" id="acessoBtn" type="submit">' + (criar ? "Criar conta" : "Entrar") + '</button></form>' +
      '<p class="acessoNota">' + (criar ? "A senha precisa de pelo menos 8 caracteres." :
        "Seus dados ficam na sua conta e aparecem em qualquer aparelho.") + '</p>';
    var foco = document.getElementById(criar ? "acessoNome" : "acessoEmail");
    if (foco) setTimeout(function () { foco.focus(); }, 50);
  }
  function mostraAcesso(msg) {
    monta().style.display = "";
    formulario(msg);
  }
  function escondeAcesso() { if (caixa) caixa.style.display = "none"; }

  function entrou(u) {
    usuario = { id: u.id, nome: u.nome || "", email: u.email || "" };
    return carrega().then(function () {
      escondeAcesso();
      prontoResolve();
      recarregarNoticias().catch(function () {});
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#acessoSobra [data-modo]");
    if (!b) return;
    modo = b.getAttribute("data-modo");
    formulario("");
  });
  document.addEventListener("submit", function (e) {
    if (!e.target || e.target.id !== "acessoForm") return;
    e.preventDefault();
    var erroEl = document.getElementById("acessoErro");
    var nome = modo === "criar" ? document.getElementById("acessoNome").value.trim() : "";
    var email = document.getElementById("acessoEmail").value.trim();
    var senha = document.getElementById("acessoSenha").value;
    if (modo === "criar" && !nome) { erroEl.textContent = "Diga como quer ser chamado."; return; }
    if (!email || !senha) { erroEl.textContent = "Preencha e-mail e senha."; return; }
    if (modo === "criar" && senha.length < 8) { erroEl.textContent = "A senha precisa de pelo menos 8 caracteres."; return; }
    var btn = document.getElementById("acessoBtn"), rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = "Um instante\u2026"; erroEl.textContent = "";
    var corpo = { email: email, senha: senha };
    if (modo === "criar") corpo.nome = nome;
    pedir("POST", modo === "criar" ? "/auth/cadastro" : "/auth/entrar", corpo)
      .then(entrou)
      .catch(function (err) {
        erroEl.textContent = err && err.message && err.message !== "falha no servidor" ? err.message :
          "Não deu para entrar agora. Tente de novo em instantes.";
        btn.disabled = false; btn.textContent = rotulo;
      });
  });

  /* ---------------- início ---------------- */
  function inicia() {
    monta();
    fetch(API + "/auth/eu", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) { if (u && u.id) return entrou(u); mostraAcesso(""); })
      .catch(function () { mostraAcesso("Sem conexão com o servidor. Confira a internet."); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicia);
  else inicia();

  /* app instalável e offline */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  }
})();
