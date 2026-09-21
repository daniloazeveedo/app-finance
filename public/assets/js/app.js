(function(){
  "use strict";
  var BRL = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
  var money = function(n){ return BRL.format(Number(n)||0); };
  var hoje = function(){ return new Date().toISOString().slice(0,10); };
  var el = function(id){ return document.getElementById(id); };
  var esc = function(s){ var d=document.createElement("div"); d.textContent=String(s==null?"":s); return d.innerHTML; };

  var CORES = ["#57BF9C","#C09FF8","#F9D16B","#E8A15A","#838383","#7C8BE0"];
  var ICONES = {Moradia:"⌂",Mercado:"⌾",Transporte:"⛁",Contas:"⌸",Saúde:"✚",
    Lazer:"◎",Salário:"↓",Outros:"•"};
  var corDe = function(cat){
    var chaves = Object.keys(ICONES), i = chaves.indexOf(cat);
    return CORES[(i<0?7:i) % CORES.length];
  };

  var estado = { lanc:[], comp:[], metas:[] };
  var db = null, sample = null, turnos = [];

  /* navegação */
  var ehDash = function(){ return window.matchMedia("(min-width:1100px)").matches; };
  function marcaNav(nome){
    document.querySelectorAll("nav button").forEach(function(b){
      if (b.dataset.tela===nome) b.setAttribute("aria-current","page");
      else b.removeAttribute("aria-current"); });
  }
  function abrir(nome){
    marcaNav(nome);
    var alvo = el("tela-"+nome);
    document.querySelectorAll(".tela").forEach(function(t){
      t.classList.toggle("on", t === alvo); });
    window.scrollTo(0,0);
  }
  document.querySelectorAll("nav button").forEach(function(b){
    b.addEventListener("click", function(){ abrir(b.dataset.tela); }); });
  function ligarAtalhos(){}
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-ir],[data-pagar],[data-apagar],[data-apagameta],"+
      "[data-guardar],[data-edlanc],[data-edcomp]");
    if (!b) return;
    var d = b.dataset;
    if (d.ir) abrir(d.ir);
    else if (d.pagar) pagar(d.pagar);
    else if (d.apagar) apagarLanc(d.apagar);
    else if (d.apagameta) apagarMeta(d.apagameta);
    else if (d.guardar) guardar(d.guardar);
    else if (d.edlanc) editarLanc(d.edlanc);
    else if (d.edcomp) editarComp(d.edcomp);
  });

  var drawer = el("drawer");
  el("btnMenu").addEventListener("click", function(){ drawer.classList.remove("oculto"); });
  el("btnSino").addEventListener("click", function(){ abrir("compromissos"); });
  drawer.addEventListener("click", function(e){
    if (e.target === drawer) drawer.classList.add("oculto");
    var t = e.target.closest("[data-tela]");
    if (t){ abrir(t.dataset.tela); drawer.classList.add("oculto"); }
  });

  var cta = el("ctaNovo");
  if (cta) cta.addEventListener("click", function(){
    abrir("lancamentos"); setTimeout(function(){ el("lDesc").focus(); }, 60); });
  function ligaBusca(id){
    var c = el(id);
    if (!c) return;
    c.addEventListener("input", function(){
      filtro.texto = c.value.trim().toLowerCase();
      if (id === "buscaTopo" && filtro.texto){ abrir("lancamentos"); el("buscaLanc").value = c.value; }
      if (id === "buscaLanc") el("buscaTopo").value = c.value;
      pintaLanc();
    });
  }
  ligaBusca("buscaTopo"); ligaBusca("buscaLanc");
  var seg = el("segmento");
  if (seg) seg.addEventListener("click", function(e){
    var b = e.target.closest("[data-filtro]");
    if (!b) return;
    filtro.tipo = b.dataset.filtro;
    seg.querySelectorAll("button").forEach(function(x){ x.classList.toggle("on", x === b); });
    pintaLanc();
  });

  var agora = new Date();
  el("mesAtual").textContent = agora.toLocaleDateString("pt-BR",{month:"long"});
  el("lData").value = hoje();

  var noMes = function(iso){ return !!iso && iso.slice(0,7) === hoje().slice(0,7); };
  function diasAte(iso){
    return Math.round((new Date(iso+"T12:00:00") - new Date(hoje()+"T12:00:00"))/86400000);
  }
  function curto(iso){
    return new Date(iso+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
  }

  /* cálculo */
  function resumo(){
    var e=0,s=0,v=0,a=0;
    estado.lanc.forEach(function(l){
      if(!noMes(l.data)) return;
      if(l.tipo==="entrada") e += Number(l.valor)||0; else s += Number(l.valor)||0;
    });
    estado.comp.forEach(function(c){
      if(c.pago) return;
      if(diasAte(c.venc) < 0) a += Number(c.valor)||0; else v += Number(c.valor)||0;
    });
    return {entradas:e, saidas:s, vencer:v, atraso:a, sobra:e-s-v-a};
  }

  function pintaSaldo(){
    var r = resumo();
    var txt = money(r.sobra), corte = txt.lastIndexOf(",");
    var alvo = el("sobra");
    alvo.classList.toggle("neg", r.sobra < 0);
    alvo.innerHTML = corte>0
      ? esc(txt.slice(0,corte)) + '<span class="cent">' + esc(txt.slice(corte)) + '</span>'
      : esc(txt);
    var sub;
    if (!estado.lanc.length && !estado.comp.length) sub = "Comece lançando o que entra e o que sai.";
    else if (r.atraso > 0) sub = money(r.atraso) + " em atraso — resolva isso antes de qualquer compra.";
    else if (r.sobra < 0) sub = "O mês não fecha com o que está registrado.";
    else sub = "Livre depois de pagar tudo que já tem data marcada.";
    el("sobraSub").textContent = sub;
    var alerta = estado.comp.some(function(c){ return !c.pago && diasAte(c.venc) <= 3; });
    el("pontoSino").classList.toggle("oculto", !alerta);
    el("chips").innerHTML =
      '<div class="chip ent"><div class="k">Entradas</div><div class="v">+ '+money(r.entradas)+'</div></div>'+
      '<div class="chip sai"><div class="k">Saídas e contas</div><div class="v">− '+
      money(r.saidas + r.vencer + r.atraso)+'</div></div>';
  }

  /* meta em destaque */
  function pintaCartaoMeta(){
    var m = estado.metas[0], dentro;
    if (!m){
      dentro = '<div class="cab"><div class="nome">Sem meta ainda</div></div>'+
        '<div class="falta">Uma meta transforma "quero" em "quanto por mês".</div>';
    } else {
      var alvo = Number(m.alvo)||0, g = Number(m.guardado)||0;
      var pct = alvo>0 ? Math.min(100, Math.round(g/alvo*100)) : 0;
      dentro = '<div class="cab"><div><div class="nome">'+esc(m.nome)+'</div>'+
        '<div class="alvo">'+money(alvo)+' à vista</div></div>'+
        '<div class="pct">'+pct+'%</div></div>'+
        '<div><div class="falta">'+money(g)+' guardados · faltam '+money(Math.max(0,alvo-g))+'</div>'+
        '<div class="barra"><span style="width:'+pct+'%"></span></div></div>';
    }
    el("cartaoMeta").outerHTML =
      '<div class="cartaoMeta" id="cartaoMeta">'+
      '<svg class="cartaoFundo" viewBox="0 0 373 180" aria-hidden="true">'+
      '<path d="M1.09993 38.6813C0.495875 31.9917 5.5001 26.1089 12.2001 25.6324L358.786 0.985125C366.088 0.465851 372.15 6.54901 371.604 13.849L360.09 167.944C359.622 174.207 354.404 179.05 348.123 179.05H24.7399C18.5307 179.05 13.3469 174.313 12.7885 168.129L1.09993 38.6813Z" fill="#313179"/></svg>'+
      '<div class="cartaoConteudo">'+dentro+'</div></div>';
    var acoes = el("acoesMeta");
    acoes.innerHTML = m
      ? '<button class="mini" data-guardar="'+esc(m.id)+'">Guardar valor</button>'+
        '<button class="mini" data-ir="metas">Ver todas</button>'
      : '<button class="mini" data-ir="metas">Criar meta</button>';
  }

  /* contas */
  function linhaComp(c){
    var d = diasAte(c.venc), texto, cls;
    if (c.pago){ texto="pago"; cls="st-ok"; }
    else if (d<0){ texto=Math.abs(d)+" dias em atraso"; cls="st-atraso"; }
    else if (d===0){ texto="vence hoje"; cls="st-hoje"; }
    else { texto="em "+d+" dias"; cls="st-futuro"; }
    return '<div class="item"><div class="corpo"><div class="t">'+esc(c.desc)+'</div>'+
      '<div class="s">'+curto(c.venc)+' · <span class="marca-st '+cls+'">'+texto+'</span></div></div>'+
      '<div class="v">'+money(c.valor)+'</div>'+
      '<button class="mini" data-edcomp="'+esc(c.id)+'" aria-label="Editar">\u270e</button>'+
      (c.pago ? '' : '<button class="mini" data-pagar="'+esc(c.id)+'">Paguei</button>')+'</div>';
  }
  function pintaComp(){
    var ordem = estado.comp.slice().sort(function(a,b){
      if (a.pago !== b.pago) return a.pago ? 1 : -1;
      return a.venc < b.venc ? -1 : 1; });
    el("listaComp").innerHTML = ordem.map(linhaComp).join("") ||
      '<div class="vazio">Nenhuma conta com data marcada. Cadastre as parcelas para não perder vencimento.</div>';
    var pend = ordem.filter(function(c){return !c.pago;}).slice(0,3);
    el("compromissosResumo").innerHTML = pend.map(linhaComp).join("") ||
      '<div class="vazio">Nada a vencer. Bom sinal.</div>';
  }

  /* lançamentos */
  function linhaLanc(l){
    var cor = l.tipo==="entrada" ? "#57BF9C" : corDe(l.cat);
    var sinal = l.tipo==="entrada" ? "+" : "−";
    return '<div class="trans" style="background:'+cor+'">'+
      '<i>'+ (ICONES[l.cat]||"•") +'</i><div class="corpo">'+
      '<div class="t">'+esc(l.desc)+'</div><div class="s">'+esc(l.cat)+' · '+curto(l.data)+'</div></div>'+
      '<div class="v">'+sinal+" "+money(l.valor)+'</div>'+
      '<button class="x" data-edlanc="'+esc(l.id)+'" aria-label="Editar lançamento">\u270e</button>'+
      '<button class="x" data-apagar="'+esc(l.id)+'" aria-label="Apagar lançamento">×</button></div>';
  }
  var filtro = {texto:"", tipo:"todos"};
  function linhaTabela(l){
    var ent = l.tipo === "entrada";
    return '<tr><td><div class="desc"><span class="setinha '+(ent?"ent":"sai")+'">'+
      (ent?"\u2191":"\u2193")+'</span>'+esc(l.desc)+'</div></td>'+
      '<td><span class="etiqueta">'+esc(l.cat)+'</span></td>'+
      '<td>'+new Date(l.data+"T12:00:00").toLocaleDateString("pt-BR")+'</td>'+
      '<td class="dir"><span class="val '+(ent?"ent":"")+'">'+(ent?"+ ":"− ")+money(l.valor)+'</span></td>'+
      '<td class="dir"><button class="x" data-edlanc="'+esc(l.id)+'" aria-label="Editar">\u270e</button>'+
      '<button class="x" data-apagar="'+esc(l.id)+'" aria-label="Apagar">\u00d7</button></td></tr>';
  }
  function pintaLanc(){
    var ordem = estado.lanc.slice().sort(function(a,b){ return a.data<b.data?1:-1; });
    var vis = ordem.filter(function(l){
      if (filtro.tipo !== "todos" && l.tipo !== filtro.tipo) return false;
      if (!filtro.texto) return true;
      return (l.desc+" "+l.cat).toLowerCase().indexOf(filtro.texto) >= 0;
    });
    if (ehDash()){
      el("listaLanc").innerHTML = vis.length
        ? '<table class="tabela"><thead><tr><th>DESCRIÇÃO</th><th>CATEGORIA</th><th>DATA</th>'+
          '<th class="dir">VALOR</th><th></th></tr></thead><tbody>'+
          vis.map(linhaTabela).join("")+'</tbody></table>'
        : '<div class="vazio">'+(ordem.length ? "Nenhum lançamento com esse filtro."
            : "Sem lançamentos ainda. O primeiro pode ser o salário do mês.")+'</div>';
    } else {
      el("listaLanc").innerHTML = vis.map(linhaLanc).join("") ||
        '<div class="vazio">Sem lançamentos ainda. O primeiro pode ser o salário do mês.</div>';
    }
    el("lancResumo").innerHTML = ordem.slice(0,3).map(linhaLanc).join("") ||
      '<div class="vazio">Sem lançamentos ainda.</div>';
  }

  /* metas */
  function linhaMeta(m){
    var alvo=Number(m.alvo)||0, g=Number(m.guardado)||0;
    var pct = alvo>0 ? Math.min(100, Math.round(g/alvo*100)) : 0;
    return '<div class="item" style="display:block">'+
      '<div style="display:flex;justify-content:space-between;gap:10px">'+
      '<div class="t">'+esc(m.nome)+'</div><div class="v">'+money(alvo)+'</div></div>'+
      '<div class="barra" style="margin-top:10px;background:var(--cartao2)"><span style="width:'+pct+'%"></span></div>'+
      '<div class="s" style="margin-top:8px">'+money(g)+' guardados · faltam '+money(Math.max(0,alvo-g))+'</div>'+
      '<div style="display:flex;gap:8px;margin-top:11px">'+
      '<button class="mini" data-guardar="'+esc(m.id)+'">Guardar valor</button>'+
      '<button class="mini" data-apagameta="'+esc(m.id)+'">Remover</button></div></div>';
  }
  function pintaMetas(){
    el("listaMetas").innerHTML = estado.metas.map(linhaMeta).join("") ||
      '<div class="vazio">Nenhuma meta ainda.</div>';
  }

  /* gráfico */
  var CX = 177.244, CY = 220.5;
  function arco(r, largura, cor, frac, classe){
    var C = 2 * Math.PI * r, tam = Math.max(0, C * frac - (frac < 1 ? 3 : 0));
    return '<circle class="fatia'+(classe?" "+classe:"")+'" cx="'+CX+'" cy="'+CY+'" r="'+r+'" '+
      'stroke="'+cor+'" stroke-width="'+largura+'" stroke-dasharray="'+tam.toFixed(2)+' '+
      (C-tam).toFixed(2)+'"></circle>';
  }
  function pintaGrafico(){
    var porCat = {};
    estado.lanc.forEach(function(l){
      if (l.tipo==="entrada" || !noMes(l.data)) return;
      porCat[l.cat] = (porCat[l.cat]||0) + (Number(l.valor)||0);
    });
    estado.comp.forEach(function(c){
      if (c.pago) return;
      porCat["Contas"] = (porCat["Contas"]||0) + (Number(c.valor)||0);
    });
    var itens = Object.keys(porCat).map(function(k){ return {cat:k, v:porCat[k]}; })
      .sort(function(a,b){ return b.v - a.v; });
    var total = itens.reduce(function(s,i){ return s+i.v; }, 0);
    el("totalGasto").textContent = money(total);
    el("totalGasto2").textContent = money(total);
    el("dataAnalise").textContent = agora.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});

    var aros = '<circle class="aro" cx="'+CX+'" cy="'+CY+'" r="17.5"></circle>'+
      '<circle class="aro" cx="'+CX+'" cy="'+CY+'" r="98.5"></circle>'+
      '<circle class="aro" cx="'+CX+'" cy="'+CY+'" r="162.5"></circle>';
    var fatias = "";
    if (total){
      var p = itens[0], fp = p.v/total;
      fatias += arco(112, 45, "url(#gArco)", fp, "brilho") + arco(112, 45, "url(#gArco)", fp);
      var raios = [162.5, 130.5, 98.5];
      itens.slice(1,4).forEach(function(it,i){
        fatias += arco(raios[i], 4, corDe(it.cat), it.v/total);
      });
    }
    el("radarBox").innerHTML =
      '<svg class="radar" viewBox="0 0 342 385" role="img" '+
      'aria-label="Divisão dos gastos do mês por categoria">'+
      '<defs><linearGradient id="gArco" x1="220" y1="102.6" x2="130.3" y2="318.1" '+
      'gradientUnits="userSpaceOnUse"><stop class="corAcento"/><stop offset="1" class="corAcento2"/>'+
      '</linearGradient><filter id="fBrilho" x="-50%" y="-50%" width="200%" height="200%">'+
      '<feGaussianBlur stdDeviation="17"/></filter></defs>'+
      aros + '<g transform="rotate(-100 '+CX+' '+CY+')">' + fatias + '</g></svg>';
    el("legenda").innerHTML = total ? itens.slice(0,6).map(function(it){
      return '<div class="l"><b style="background:'+corDe(it.cat)+'"></b>'+
        '<span>'+esc(it.cat)+'</span><em>−'+money(it.v)+'</em></div>';
    }).join("") : '<div class="vazio">Sem gastos lançados neste mês.</div>';
  }

  function pintaFluxo(){
    var caixa = el("fluxoBox");
    if (!caixa) return;
    var ini = new Date(agora.getFullYear(), agora.getMonth(), 1);
    var dias = new Date(agora.getFullYear(), agora.getMonth()+1, 0).getDate();
    el("fluxoPeriodo").textContent = "1 a " + dias;
    var porDia = new Array(dias+1).join("0").split("").map(Number);
    estado.lanc.forEach(function(l){
      if (!noMes(l.data)) return;
      var d = Number(l.data.slice(8,10));
      if (d>=1 && d<=dias) porDia[d-1] += (l.tipo==="entrada" ? 1 : -1) * (Number(l.valor)||0);
    });
    var acum = [], soma = 0;
    for (var i=0;i<dias;i++){ soma += porDia[i]; acum.push(soma); }
    var W=700, H=240, pad=18;
    var max = Math.max.apply(null, acum.concat([0])), min = Math.min.apply(null, acum.concat([0]));
    var faixa = (max - min) || 1;
    var px = function(i){ return pad + i*(W-2*pad)/(dias-1); };
    var py = function(v){ return H - pad - (v-min)/faixa*(H-2*pad); };
    var pts = acum.map(function(v,i){ return px(i).toFixed(1)+","+py(v).toFixed(1); }).join(" ");
    var area = "M"+px(0).toFixed(1)+","+py(min).toFixed(1)+" L"+pts.split(" ").join(" L")+
      " L"+px(dias-1).toFixed(1)+","+py(min).toFixed(1)+" Z";
    var grade = [0,.25,.5,.75,1].map(function(f){
      var y = pad + f*(H-2*pad);
      return '<line x1="'+pad+'" y1="'+y+'" x2="'+(W-pad)+'" y2="'+y+
        '" class="gradeFluxo" stroke-dasharray="3 5"/>';
    }).join("");
    var marcas = [1,5,10,15,20,25,dias].map(function(d){
      return '<text x="'+px(d-1).toFixed(1)+'" y="'+(H-2)+'" class="eixo" font-size="11" '+
        'text-anchor="middle">'+d+'</text>';
    }).join("");
    caixa.innerHTML = '<svg class="fluxo" viewBox="0 0 '+W+' '+H+'" role="img" '+
      'aria-label="Saldo acumulado ao longo do mês">'+
      '<defs><linearGradient id="gFluxo" x1="0" y1="0" x2="0" y2="1">'+
      '<stop class="corAcento" stop-opacity=".3"/><stop offset="1" class="corAcento" stop-opacity="0"/>'+
      '</linearGradient></defs>'+ grade +
      '<path d="'+area+'" fill="url(#gFluxo)"/>'+
      '<polyline points="'+pts+'" class="linhaFluxo" fill="none" stroke-width="2.5" '+
      'stroke-linejoin="round" stroke-linecap="round"/>'+ marcas +'</svg>';
  }

  function pintaTudo(){ pintaSaldo(); pintaCartaoMeta(); pintaComp(); pintaLanc(); pintaMetas(); pintaGrafico(); pintaFluxo(); }

  /* escrita */
  function semBanco(){ alert("Os dados não podem ser salvos nesta visualização. Abra o artifact publicado na sua conta."); }
  function erroDb(e){
    if (e && e.code === "quota_exceeded") alert("O banco deste app está cheio. Apague registros antigos.");
    else if (e && e.code === "invalid_argument") alert("Você não tem permissão de escrita neste app.");
  }

  var editando = {lanc:null, comp:null};

  function modoLanc(){
    var on = !!editando.lanc;
    el("btnLanc").textContent = on ? "Salvar alterações" : "Adicionar lançamento";
    el("cancelaLanc").classList.toggle("oculto", !on);
  }
  function limpaLanc(){
    editando.lanc = null; el("formLanc").reset(); el("lData").value = hoje(); modoLanc();
  }
  function editarLanc(id){
    var l = estado.lanc.filter(function(x){ return x.id===id; })[0];
    if (!l) return;
    editando.lanc = id;
    el("lDesc").value = l.desc; el("lValor").value = l.valor;
    el("lTipo").value = l.tipo; el("lCat").value = l.cat; el("lData").value = l.data;
    modoLanc(); abrir("lancamentos");
    setTimeout(function(){ el("lDesc").focus(); }, 60);
  }
  el("cancelaLanc").addEventListener("click", limpaLanc);

  el("formLanc").addEventListener("submit", function(e){
    e.preventDefault();
    if(!db) return semBanco();
    var d = {desc:el("lDesc").value.trim(), valor:Number(el("lValor").value),
      tipo:el("lTipo").value, cat:el("lCat").value, data:el("lData").value};
    if(!d.desc || !(d.valor>0)) return;
    if (editando.lanc) db.doc("lancamentos/"+editando.lanc).update(d).catch(erroDb);
    else db.collection("lancamentos").add(d).catch(erroDb);
    limpaLanc();
  });
  function modoComp(){
    var on = !!editando.comp;
    el("btnComp").textContent = on ? "Salvar alterações" : "Adicionar conta";
    el("cancelaComp").classList.toggle("oculto", !on);
  }
  function limpaComp(){ editando.comp = null; el("formComp").reset(); modoComp(); }
  function editarComp(id){
    var c = estado.comp.filter(function(x){ return x.id===id; })[0];
    if (!c) return;
    editando.comp = id;
    el("cDesc").value = c.desc; el("cValor").value = c.valor;
    el("cVenc").value = c.venc; el("cRec").value = c.rec || "unico";
    modoComp(); abrir("compromissos");
    setTimeout(function(){ el("cDesc").focus(); }, 60);
  }
  el("cancelaComp").addEventListener("click", limpaComp);

  el("formComp").addEventListener("submit", function(e){
    e.preventDefault();
    if(!db) return semBanco();
    var d = {desc:el("cDesc").value.trim(), valor:Number(el("cValor").value),
      venc:el("cVenc").value, rec:el("cRec").value};
    if(!d.desc || !(d.valor>0) || !d.venc) return;
    if (editando.comp) db.doc("compromissos/"+editando.comp).update(d).catch(erroDb);
    else { d.pago = false; db.collection("compromissos").add(d).catch(erroDb); }
    limpaComp();
  });
  el("formMeta").addEventListener("submit", function(e){
    e.preventDefault();
    if(!db) return semBanco();
    var d = {nome:el("mNome").value.trim(), alvo:Number(el("mAlvo").value), guardado:0};
    if(!d.nome || !(d.alvo>0)) return;
    db.collection("metas").add(d).catch(erroDb);
    el("formMeta").reset();
  });

  function pagar(id){
    if(!db) return semBanco();
    var c = estado.comp.filter(function(x){return x.id===id;})[0];
    if(!c) return;
    if (c.pago) return;
    db.doc("compromissos/"+id).update({pago:true}).catch(erroDb);
    if (c.rec !== "mensal") return;
    var d = new Date(c.venc+"T12:00:00"), dia = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth()+1);
    var ultimo = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    d.setDate(Math.min(dia, ultimo));
    var prox = d.toISOString().slice(0,10);
    var repetida = estado.comp.some(function(x){
      return x.id !== id && x.desc === c.desc && x.venc === prox; });
    if (repetida) return;
    db.collection("compromissos").add({desc:c.desc, valor:c.valor,
      venc:prox, rec:"mensal", pago:false}).catch(erroDb);
  }
  function apagarLanc(id){ if(!db) return semBanco(); db.doc("lancamentos/"+id).delete().catch(erroDb); }
  function apagarMeta(id){ if(!db) return semBanco(); db.doc("metas/"+id).delete().catch(erroDb); }
  function guardar(id){
    if(!db) return semBanco();
    var m = estado.metas.filter(function(x){return x.id===id;})[0];
    if(!m) return;
    var n = Number(String(prompt("Quanto você está guardando agora?","")||"").replace(",","."));
    if(!(n>0)) return;
    db.doc("metas/"+id).update({guardado:(Number(m.guardado)||0)+n}).catch(erroDb);
  }

  /* agente */
  function contexto(){
    var r = resumo(), L = [];
    L.push("SITUAÇÃO DO MÊS ("+agora.toLocaleDateString("pt-BR",{month:"long",year:"numeric"})+", hoje é "+hoje()+"):");
    L.push("- Entradas: "+money(r.entradas));
    L.push("- Saídas lançadas: "+money(r.saidas));
    L.push("- Contas a vencer: "+money(r.vencer));
    L.push("- Contas em atraso: "+money(r.atraso));
    L.push("- Sobra projetada: "+money(r.sobra));
    L.push("");
    L.push("CONTAS EM ABERTO:");
    var ab = estado.comp.filter(function(c){return !c.pago;})
      .sort(function(a,b){return a.venc<b.venc?-1:1;}).slice(0,25);
    L.push(ab.length ? ab.map(function(c){
      return "- "+c.desc+": "+money(c.valor)+", vence "+c.venc+
        (diasAte(c.venc)<0?" (EM ATRASO)":"")+(c.rec==="mensal"?" [mensal]":"");
    }).join("\n") : "- nenhuma");
    L.push("");
    L.push("METAS:");
    L.push(estado.metas.length ? estado.metas.map(function(m){
      return "- "+m.nome+": alvo "+money(m.alvo)+", guardado "+money(m.guardado);
    }).join("\n") : "- nenhuma");
    L.push("");
    L.push("LANÇAMENTOS RECENTES (até 40):");
    var u = estado.lanc.slice().sort(function(a,b){return a.data<b.data?1:-1;}).slice(0,40);
    L.push(u.length ? u.map(function(l){
      return "- "+l.data+" "+(l.tipo==="entrada"?"+":"-")+money(l.valor)+" "+l.desc+" ("+l.cat+")";
    }).join("\n") : "- nenhum");
    return L.join("\n");
  }

  var REGRAS = [
    "Você é o agente financeiro de um app brasileiro de finanças pessoais e responde em português do Brasil.",
    "Baseie tudo nos dados do app enviados na pergunta. Nunca invente valores; se faltar um dado, diga qual falta e peça para cadastrar.",
    "Prioridade fixa: 1) contas em atraso, 2) contas a vencer, 3) despesas essenciais, 4) reserva de emergência, 5) metas de consumo.",
    "Desaconselhe parcelamento e crédito rotativo para consumo. Prefira juntar e comprar à vista.",
    "Não recomende investimentos, ações, cripto ou produtos financeiros — você organiza orçamento, não dá consultoria de investimento.",
    "Seja curto e concreto: no máximo 6 linhas ou 5 tópicos. Mostre a conta quando fizer diferença. Use R$ com duas casas.",
    "Não julgue a pessoa. Seja honesto sobre riscos, inclusive quando a resposta for 'ainda não dá'."
  ].join(" ");

  function bolha(txt, quem){
    var d = document.createElement("div");
    d.className = "bolha "+quem; d.textContent = txt;
    el("chat").appendChild(d); d.scrollIntoView({block:"nearest"});
    return d;
  }
  var ctl = null;
  function copiaErro(code){
    if (code==="not_granted"||code==="sampling_disabled") return "O agente não está liberado nesta visualização.";
    if (code==="rate_limited") return "Muitas perguntas em pouco tempo. Tente de novo daqui a pouco.";
    if (code==="session_expired") return "Sua sessão expirou. Entre de novo e repita a pergunta.";
    if (code==="prompt_too_large") return "Há dados demais para uma pergunta só. Apague lançamentos antigos.";
    if (code==="refused") return "O agente não respondeu a essa pergunta. Tente reformular.";
    return "Algo falhou no caminho. Tente perguntar de novo.";
  }
  function desligaAgente(){ el("formChat").classList.add("oculto"); el("sugs").classList.add("oculto"); }

  function perguntar(texto){
    if (!sample){ bolha("O agente não está disponível nesta visualização.","ele"); return; }
    if (!texto) return;
    bolha(texto,"eu");
    turnos.push({role:"user", content: contexto()+"\n\nPERGUNTA: "+texto});
    while (turnos.length > 9) turnos.splice(0,1);
    var alvo = bolha("Pensando…","ele");
    ctl = new AbortController();
    el("btnEnviar").disabled = true; el("btnParar").classList.remove("oculto");
    sample([{role:"user",content:REGRAS}].concat(turnos), {
      cache:false, signal:ctl.signal,
      onText:function(u){ alvo.textContent = u.text; }
    }).then(function(res){
      alvo.textContent = res.text;
      turnos.push({role:"assistant", content:res.text});
    }).catch(function(e){
      if (e && e.code === "cancelled"){ if(!e.text) alvo.remove(); else alvo.textContent = e.text; }
      else alvo.textContent = (e && e.text ? e.text+"\n\n" : "") + copiaErro(e && e.code);
      if (e && (e.code==="not_granted"||e.code==="sampling_disabled")) desligaAgente();
    }).then(function(){
      el("btnEnviar").disabled = false; el("btnParar").classList.add("oculto"); ctl = null;
    });
  }
  el("formChat").addEventListener("submit", function(e){
    e.preventDefault();
    var t = el("pergunta").value.trim();
    if(!t) return;
    el("pergunta").value = ""; perguntar(t);
  });
  el("btnParar").addEventListener("click", function(){ if(ctl) ctl.abort(); });
  document.querySelectorAll(".sug").forEach(function(b){
    b.addEventListener("click", function(){ perguntar(b.textContent); }); });

  /* tela inicial — aparece a cada abertura, como pedido */
  var onbPronto = false;
  function mostraOnboarding(){
    var onb = el("onb");
    if (!onb) return;
    if (ehDash()){ onb.classList.add("oculto"); return; }  // no desktop ela não cabe
    onb.classList.remove("oculto");
    document.body.classList.add("onbAtivo");
    if (onbPronto) return;
    onbPronto = true;

    var btn = el("onbBtn"), circ = el("onbCirc"), caixa = btn.parentNode;
    function posiciona(){
      var c = circ.getBoundingClientRect(), q = caixa.getBoundingClientRect();
      btn.style.left = (c.left - q.left) + "px";
      btn.style.top = (c.top - q.top) + "px";
      btn.style.width = c.width + "px";
      btn.style.height = c.height + "px";
    }
    posiciona();
    window.addEventListener("resize", posiciona);
    btn.addEventListener("click", function(){
      document.body.classList.remove("onbAtivo");
      onb.classList.add("oculto");
    });
  }


  /* ligar */
  ligarAtalhos();
  pintaTudo();

  function escuta(nome, chave){
    db.collection(nome).onSnapshot(function(snap){
      estado[chave] = snap.docs.map(function(d){
        var o = Object.assign({}, d.data()); o.id = d.id; return o; });
      pintaTudo();
    }, function(){});
  }

  function conecta(nome){
    if (window.claude && typeof window.claude.use === "function")
      return window.claude.use(nome).catch(function(){ return null; });
    return Promise.resolve(null);
  }

  var cfg = window.CAIXA_CONFIG || {};
  var base = String(cfg.apiUrl || "").replace(/\/$/, "");
  var avisou = false;
  function avisaServidor(e){
    if (avisou) return;
    avisou = true;
    alert("Não consegui falar com o servidor. Suas alterações não estão sendo salvas. " +
      "Verifique a conexão e recarregue a página.");
    console.error("Falha na API:", e);
  }

  /* ---------- conta ---------- */
  var modoConta = "entrar";

  function erroConta(msg){
    var p = el("contaErro");
    p.textContent = msg || "";
    p.classList.toggle("oculto", !msg);
  }

  function trocaAba(modo){
    modoConta = modo;
    el("contaAbas").querySelectorAll("button").forEach(function(b){
      b.classList.toggle("on", b.dataset.aba === modo); });
    document.querySelectorAll(".soCriar").forEach(function(d){
      d.classList.toggle("oculto", modo !== "criar"); });
    el("btnConta").textContent = modo === "criar" ? "Criar conta" : "Entrar";
    el("cSenha").setAttribute("autocomplete",
      modo === "criar" ? "new-password" : "current-password");
    erroConta("");
  }

  function mostraConta(){
    el("conta").classList.remove("oculto");
    el("onb").classList.add("oculto");
    document.body.classList.remove("onbAtivo");
    setTimeout(function(){ el("cEmail").focus(); }, 60);
  }

  function pedeConta(caminho, corpo){
    return fetch(base + caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(corpo)
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if (r.ok) return j;
        throw new Error(j.erro || "não foi possível continuar");
      });
    }, function(){ throw new Error("sem resposta do servidor"); });
  }

  el("contaAbas").addEventListener("click", function(e){
    var b = e.target.closest("[data-aba]");
    if (b) trocaAba(b.dataset.aba);
  });

  el("formConta").addEventListener("submit", function(e){
    e.preventDefault();
    erroConta("");
    var dados = { email: el("cEmail").value.trim(), senha: el("cSenha").value };
    if (!dados.email || !dados.senha) return erroConta("Preencha e-mail e senha.");
    if (modoConta === "criar"){
      dados.nome = el("cNome").value.trim();
      if (!dados.nome) return erroConta("Diga como quer ser chamado.");
      if (dados.senha.length < 8) return erroConta("A senha precisa de pelo menos 8 caracteres.");
    }
    var botao = el("btnConta"), rotulo = botao.textContent;
    botao.disabled = true; botao.textContent = "Um instante…";
    pedeConta(modoConta === "criar" ? "/auth/cadastro" : "/auth/entrar", dados)
      .then(entrou)
      .catch(function(err){ erroConta(err.message); })
      .then(function(){ botao.disabled = false; botao.textContent = rotulo; });
  });

  function sair(){
    fetch(base + "/auth/sair", { method:"POST", credentials:"same-origin" })
      .then(function(){ location.reload(); }, function(){ location.reload(); });
  }
  ["sairMob","sairDesk"].forEach(function(id){
    var b = el(id);
    if (b) b.addEventListener("click", sair);
  });

  /* ---------- banco ---------- */
  var bancoLigado = false;
  function ligaBanco(x){
    if (bancoLigado) return;
    bancoLigado = true;
    db = x;
    escuta("lancamentos","lanc");
    escuta("compromissos","comp");
    escuta("metas","metas");
  }

  function entrou(usuario){
    el("conta").classList.add("oculto");
    var q = el("quemSou");
    if (q && usuario && usuario.nome) q.textContent = usuario.nome;
    ligaBanco(window.BancoRemoto({ url: cfg.apiUrl, aoFalhar: avisaServidor }));
    mostraOnboarding();
  }

  conecta("db").then(function(x){
    if (x){ ligaBanco(x); mostraOnboarding(); return; }   // dentro do Claude
    if (!base){                                            // sem servidor: só este aparelho
      ligaBanco(window.BancoLocal("caixa.dados"));
      mostraOnboarding();
      return;
    }
    fetch(base + "/auth/eu", { credentials: "same-origin" })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(u){ if (u) entrou(u); else mostraConta(); })
      .catch(function(){ mostraConta(); });
  });

  conecta("sample").then(function(x){
    if (x){ sample = x; return; }
    var url = cfg.agenteUrl || (base ? base + "/agente" : "");
    if (!url){ desligaAgente(); avisoAgente(); return; }
    sample = function(turnos, opcoes){
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ messages: turnos }),
        signal: opcoes && opcoes.signal
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(j){
          if (r.ok) return { text: j.text || "" };
          throw { code: r.status === 429 ? "rate_limited" : "http_" + r.status };
        });
      });
    };
  });

  function avisoAgente(){
    var p = document.querySelector("#tela-agente .aviso");
    if (p) p.textContent = "O agente precisa de um backend que guarde a chave da API. " +
      "Veja o README para configurar.";
  }
})();
