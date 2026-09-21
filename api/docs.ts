/** /api/docs — onde o app guarda os dados de cada pessoa.
 *
 *  GET   → { colecoes: { lancamentos: { <id>: {...} }, contas: {...}, ... } }
 *  POST  { op: "set" | "update" | "delete", colecao, id, dados? } → { ok: true }
 *
 *  Tudo é sempre do usuário da sessão: o id de usuário nunca vem do cliente. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db";
import { usuarioDa } from "../lib/auth";
import { rota, responde, corpoDa } from "../lib/http";
import { DadoInvalido } from "../lib/validacao";

const COLECOES = new Set([
  "lancamentos", "compromissos", "metas", "contas",
  "categorias", "limites", "vistas", "leituras"
]);
const ID = /^[A-Za-z0-9_\-.:~@+]{1,120}$/;
const TAMANHO_MAXIMO = 32_000;      // por documento, em caracteres de JSON
const DOCUMENTOS_POR_PESSOA = 50_000;

export default rota(["GET", "POST"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = await usuarioDa(req);
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const linhas = await sql`
      select colecao, id, dados from documentos where usuario_id = ${usuario}`;
    const colecoes: Record<string, Record<string, unknown>> = {};
    for (const l of linhas) {
      const c = l.colecao as string;
      (colecoes[c] ??= {})[l.id as string] = l.dados;
    }
    return responde(res, 200, { colecoes });
  }

  const c = corpoDa(req);
  const op = String(c.op ?? "");
  const colecao = String(c.colecao ?? "");
  const id = String(c.id ?? "");
  if (!COLECOES.has(colecao)) throw new DadoInvalido("coleção desconhecida");
  if (!ID.test(id)) throw new DadoInvalido("id inválido");

  if (op === "delete") {
    await sql`delete from documentos
               where usuario_id = ${usuario} and colecao = ${colecao} and id = ${id}`;
    return responde(res, 200, { ok: true });
  }

  const dados = c.dados;
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw new DadoInvalido("dados precisam ser um objeto");
  }
  const json = JSON.stringify(dados);
  if (json.length > TAMANHO_MAXIMO) throw new DadoInvalido("registro grande demais");

  if (op === "set") {
    const [conta] = await sql`select count(*)::int as n from documentos where usuario_id = ${usuario}`;
    if ((conta?.n as number) >= DOCUMENTOS_POR_PESSOA) {
      return responde(res, 413, { erro: "limite de registros atingido" });
    }
    await sql`
      insert into documentos (usuario_id, colecao, id, dados)
      values (${usuario}, ${colecao}, ${id}, ${json}::jsonb)
      on conflict (usuario_id, colecao, id)
      do update set dados = excluded.dados, atualizado_em = now()`;
    return responde(res, 200, { ok: true });
  }

  if (op === "update") {
    const feitos = await sql`
      update documentos set dados = dados || ${json}::jsonb, atualizado_em = now()
       where usuario_id = ${usuario} and colecao = ${colecao} and id = ${id}
      returning id`;
    if (!feitos.length) return responde(res, 404, { erro: "registro não encontrado" });
    return responde(res, 200, { ok: true });
  }

  throw new DadoInvalido("operação inválida");
});
