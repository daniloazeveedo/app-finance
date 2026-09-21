/*
 * Sobra — curadoria de notícias (Vercel Function)
 * GET /api/noticias  →  { atualizadoEm, itens: [...] }
 *
 * Lê feeds RSS de veículos brasileiros, pede ao Claude para escolher as mais
 * relevantes e escrever no tom do the news, e devolve JSON para o app.
 * A resposta fica 30 min no cache da CDN da Vercel: no máximo ~48 chamadas
 * à IA por dia, não importa quantas pessoas abram o app.
 *
 * Sem chave da API (ou sem crédito), funciona do mesmo jeito em "modo manchetes":
 * títulos e resumos curtos publicados pelos próprios jornais, com link, mais as
 * edições do the news como cartões que abrem no site deles.
 *
 * Variáveis de ambiente (Vercel → Settings → Environment Variables):
 *   ANTHROPIC_API_KEY  (opcional)     liga a curadoria com IA
 *   SOBRA_MODELO       (opcional)     modelo; padrão claude-haiku-4-5-20251001
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";

const FEEDS = [
  { nome: "g1", url: "https://g1.globo.com/rss/g1/", tema: "brasil" },
  { nome: "g1", url: "https://g1.globo.com/rss/g1/economia/", tema: "economia" },
  { nome: "Agência Brasil", url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", tema: "brasil" },
  { nome: "BBC News Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml", tema: "mundo" },
  { nome: "InfoMoney", url: "https://www.infomoney.com.br/feed/", tema: "economia" },
  { nome: "CNN Brasil", url: "https://www.cnnbrasil.com.br/feed/", tema: "brasil" }
];
/* feed oficial do the news (beehiiv): usado só para título, data e link de cada edição */
const THE_NEWS = "https://rss.beehiiv.com/feeds/j9teVW9Qmi.xml";
const MODELO = process.env.SOBRA_MODELO || "claude-haiku-4-5-20251001";
const TEMAS = ["brasil", "mundo", "economia", "política", "tecnologia", "saúde", "clima", "esporte", "ciência"];
const ESTILO =
  "Escreva como o the news: português do Brasil, tom leve e descontraído, frases curtas, direto ao ponto, " +
  "como quem conta a notícia para um amigo esperto no café da manhã. Sem economês nem jargão; se um termo " +
  "técnico for inevitável, explique em poucas palavras. Emoji só no campo emoji, nunca no texto. Título curto " +
  "(até uns 70 caracteres), com gancho, sem clickbait e sem ponto final. Texto de 2 a 4 frases: o que aconteceu, " +
  "por que importa e, quando fizer sentido, o que muda no bolso de quem lê. Política sempre neutra: só fatos, " +
  "sem adjetivos, opinião ou favorecimento de lados e candidatos.";

let memoria: { t: number; corpo: unknown } | null = null; // cache da instância, além do cache da CDN

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
function limpa(s: unknown): string {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (e) => ENT[e])
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}
function tag(xml: string, nome: string): string {
  const m = xml.match(new RegExp("<" + nome + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + nome + ">", "i"));
  return m ? limpa(m[1]) : "";
}

interface Item { fonte: string; tema: string; titulo: string; resumo: string; url: string; data: string; t?: number }

async function lerFeed(f: { nome: string; url: string; tema?: string }): Promise<Item[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(f.url, { signal: ctrl.signal, headers: { "user-agent": "SobraApp/1.0 (curadoria de noticias)" } });
    if (!r.ok) return [];
    const buf = Buffer.from(await r.arrayBuffer());
    const cab = buf.subarray(0, 200).toString("latin1");
    const latin = /encoding=["'](iso-8859-1|windows-1252)["']/i.test(cab);
    const xml = buf.toString(latin ? "latin1" : "utf8");
    return xml.split(/<item[\s>]/i).slice(1).map((b) => ({
      fonte: f.nome,
      tema: f.tema || "brasil",
      titulo: tag(b, "title"),
      resumo: tag(b, "description").slice(0, 300),
      url: tag(b, "link") || tag(b, "guid"),
      data: tag(b, "pubDate") || tag(b, "dc:date")
    })).filter((i) => i.titulo && /^https:\/\//.test(i.url));
  } catch (e) {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function candidatas(): Promise<(Item & { t: number })[]> {
  const listas = await Promise.all(FEEDS.map(lerFeed));
  const limite = Date.now() - 36 * 3600 * 1000;
  const vistos = new Set();
  return listas.flat()
    .map((i) => ({ ...i, t: new Date(i.data).getTime() }))
    .filter((i) => !isNaN(i.t) && i.t >= limite && i.t <= Date.now() + 3600 * 1000)
    .filter((i) => !/especial[\s_-]*publicit/i.test(i.url + " " + i.titulo))
    .filter((i) => !/^https:\/\/g1\.globo\.com\/[a-z]{2}\//i.test(i.url))   /* g1 regional */
    .sort((a, b) => b.t - a.t)
    .filter((i) => {
      const k = i.titulo.toLowerCase().slice(0, 60);
      if (vistos.has(i.url) || vistos.has(k)) return false;
      vistos.add(i.url); vistos.add(k); return true;
    })
    .slice(0, 45);
}

async function curar(cands: Item[]): Promise<any[]> {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric"
  });
  const prompt =
    "Você é o editor da aba news do app Sobra. Hoje é " + hoje + " (horário de Brasília).\n" +
    "Das matérias candidatas abaixo, escolha as até 8 mais relevantes para quem mora no Brasil. Critérios: " +
    "impacto em muita gente; peso para economia e bolso (juros, preços, emprego, câmbio, combustível); decisões " +
    "de governo; grandes acontecimentos internacionais. Ignore: notícias locais de pouco alcance (evento de uma " +
    "cidade, programação cultural), crimes isolados, fofoca, publicidade e resultado esportivo comum. Não escolha " +
    "duas sobre o mesmo assunto. Use só fatos do título e do resumo; não invente números, datas ou falas. " +
    "Não copie frases: reescreva com suas palavras.\n" + ESTILO + "\n" +
    'Responda SOMENTE com JSON: {"itens":[{"i":0,"tema":"brasil","emoji":"🗳️","relevancia":3,"titulo":"","texto":""}]}. ' +
    "tema é um de: " + TEMAS.join(", ") + ". relevancia de 1 a 5 (5 só para algo muito grande). " +
    "i é o número da candidata.\n\nCANDIDATAS:\n" +
    JSON.stringify(cands.map((c, i) => ({ i, fonte: c.fonte, titulo: c.titulo, resumo: c.resumo, data: c.data })));

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({ model: MODELO, max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
  });
  if (!r.ok) throw new Error("Claude " + r.status + ": " + (await r.text()).slice(0, 300));
  const j: any = await r.json();
  const txt = (j.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  return Array.isArray(json.itens) ? json.itens : [];
}

const idDe = (url: string) => "n-" + createHash("sha1").update(url).digest("hex").slice(0, 16);

/* Sem IA: manchetes como os próprios jornais publicam, no máximo 3 por veículo. */
function manchetes(cands: (Item & { t: number })[], agora: string) {
  const porFonte: Record<string, number> = {};
  const itens: any[] = [];
  for (const c of cands) {
    if ((porFonte[c.fonte] ?? 0) >= 3) continue;
    porFonte[c.fonte] = (porFonte[c.fonte] ?? 0) + 1;
    const resumo = c.resumo.length > 220 ? c.resumo.slice(0, 217).replace(/\s+\S*$/, "") + "…" : c.resumo;
    itens.push({
      id: idDe(c.url), titulo: c.titulo.slice(0, 160),
      texto: resumo || "Toque em ler para ver a matéria completa.",
      tema: c.tema, emoji: "", relevancia: 3, fonte: c.fonte, url: c.url,
      quando: new Date(c.t).toISOString(), entrou: agora, origem: "manchete"
    });
    if (itens.length >= 12) break;
  }
  return itens;
}

/* Edições do the news: só título, data e link. O conteúdo é deles e abre no site deles. */
async function edicoesTheNews(agora: string) {
  const lista = await lerFeed({ nome: "the news", url: THE_NEWS, tema: "the news" });
  const limite = Date.now() - 3 * 86400 * 1000;
  return lista
    .map((i) => ({ ...i, t: new Date(i.data).getTime() }))
    .filter((i) => !isNaN(i.t) && i.t >= limite)
    .slice(0, 4)
    .map((i) => {
      const noite = /^night/i.test(i.titulo), manha = /^\d{2}\/\d{2}/.test(i.titulo);
      return {
      id: idDe(i.url),
      titulo: noite ? "the news " + i.titulo.toLowerCase()
        : manha ? "the news · edição de " + i.titulo.slice(0, 5) : "the news · " + i.titulo.toLowerCase(),
      texto: (noite ? "A edição da noite" : manha ? "A edição da manhã" : "Uma edição especial") +
        " do the news. Toque em ler para abrir no site deles.",
      tema: "the news", emoji: "☕", relevancia: 3, fonte: "the news", url: i.url,
      quando: new Date(i.t).toISOString(), entrou: agora, origem: "the news"
      };
    });
}

function envia(res: VercelResponse, status: number, corpo: unknown, cache: boolean): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", cache ? "public, s-maxage=1800, stale-while-revalidate=3600" : "no-store");
  res.end(JSON.stringify(corpo));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  /* qualquer variação de endereço volta para o mesmo, para não furar o cache */
  if ((req.url || "").includes("?")) {
    res.statusCode = 308; res.setHeader("location", "/api/noticias"); return res.end();
  }
    if (memoria && Date.now() - memoria.t < 25 * 60 * 1000) return envia(res, 200, memoria.corpo, true);
  const agora = new Date().toISOString();
  let cands: (Item & { t: number })[] = [];
  let theNews: any[] = [];
  try {
    [cands, theNews] = await Promise.all([candidatas(), edicoesTheNews(agora).catch(() => [])]);
    if (!cands.length && !theNews.length) throw new Error("nenhum feed respondeu com notícias recentes");
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("sem chave da API: modo manchetes");
    const escolhidas = await curar(cands);
    const ids = new Set();
    const itens = escolhidas.slice(0, 8).map((x: any) => {
      const c = cands[Number(x && x.i)];
      if (!c || !x.titulo || !x.texto) return null;
      const id = "n-" + createHash("sha1").update(c.url).digest("hex").slice(0, 16);
      if (ids.has(id)) return null;
      ids.add(id);
      return {
        id,
        titulo: String(x.titulo).slice(0, 140),
        texto: String(x.texto).slice(0, 900),
        tema: TEMAS.includes(x.tema) ? x.tema : "brasil",
        emoji: String(x.emoji || "").slice(0, 8),
        relevancia: Math.max(1, Math.min(5, Math.round(Number(x.relevancia) || 3))),
        fonte: c.fonte,
        url: c.url,
        quando: new Date(c.t).toISOString(),
        entrou: agora,
        origem: "servidor"
      };
    }).filter(Boolean);
    if (!itens.length) throw new Error("a IA não escolheu nenhuma notícia");
    const corpo = { atualizadoEm: agora, modo: "curadoria", itens: itens.concat(theNews) };
    memoria = { t: Date.now(), corpo };
    return envia(res, 200, corpo, true);
  } catch (e: any) {
    console.warn("[noticias]", e && e.message);
    if (memoria) return envia(res, 200, memoria.corpo, true);
    const itens = manchetes(cands, agora).concat(theNews);
    if (!itens.length) return envia(res, 502, { erro: "Não deu para montar as notícias agora." }, false);
    const corpo = { atualizadoEm: agora, modo: "manchetes", itens };
    memoria = { t: Date.now(), corpo };
    return envia(res, 200, corpo, true);
  }
}
