/** POST /api/agente — ponte entre o app e a API da Anthropic.
 *
 *  Existe por um motivo só: a chave da API não pode ficar no navegador.
 *  Aqui ela vem de variável de ambiente e nunca sai do servidor.
 *
 *  Entrada:  { "messages": [ { "role": "user", "content": "..." } ] }
 *  Saída:    { "text": "resposta do modelo" }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { usuarioDa } from "../lib/auth";
import { rota, responde, corpoDa } from "../lib/http";
import { DadoInvalido } from "../lib/validacao";

const LIMITE_MENSAGENS = 20;
const LIMITE_CARACTERES = 60_000;

interface Turno {
  role: "user" | "assistant";
  content: string;
}

function turnosDe(corpo: Record<string, unknown>): Turno[] {
  const bruto = corpo.messages;
  if (!Array.isArray(bruto) || bruto.length === 0) {
    throw new DadoInvalido("messages precisa ser uma lista com ao menos um item");
  }
  if (bruto.length > LIMITE_MENSAGENS) {
    throw new DadoInvalido(`no máximo ${LIMITE_MENSAGENS} mensagens por chamada`);
  }

  let total = 0;
  return bruto.map((m: any, i: number) => {
    const role = m?.role === "assistant" ? "assistant" : "user";
    const content = typeof m?.content === "string" ? m.content : "";
    if (!content) throw new DadoInvalido(`mensagem ${i} sem conteúdo`);
    total += content.length;
    if (total > LIMITE_CARACTERES) throw new DadoInvalido("conversa longa demais");
    return { role, content };
  });
}

export default rota(["POST"], async (req: VercelRequest, res: VercelResponse) => {
  await usuarioDa(req); // mesma porta de entrada das outras rotas

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return responde(res, 503, { erro: "agente não configurado neste ambiente" });

  const messages = turnosDe(corpoDa(req));
  const modelo = process.env.MODELO_AGENTE || "claude-sonnet-5";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: modelo, max_tokens: 2000, messages })
  });

  if (!r.ok) {
    // O corpo do erro pode trazer detalhes da conta; não repassa ao cliente.
    console.error("Anthropic respondeu", r.status, await r.text().catch(() => ""));
    const status = r.status === 429 ? 429 : 502;
    return responde(res, status, {
      erro: status === 429 ? "muitas perguntas seguidas" : "o agente não respondeu"
    });
  }

  const dados: any = await r.json();
  const text = (dados.content || [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();

  res.setHeader("Cache-Control", "no-store");
  responde(res, 200, { text });
});
