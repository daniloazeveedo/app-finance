/** PATCH e DELETE /api/metas/:id */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { usuarioDa } from "../../lib/auth";
import { rota, responde, corpoDa, idDa } from "../../lib/http";
import { texto, dinheiro, somenteEnviados } from "../../lib/validacao";

export default rota(["PATCH", "DELETE"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = await usuarioDa(req);
  const id = idDa(req);

  if (req.method === "DELETE") {
    const apagados = await sql`
      delete from metas where id = ${id} and usuario_id = ${usuario} returning id`;
    if (!apagados.length) return responde(res, 404, { erro: "não encontrado" });
    return responde(res, 200, { id });
  }

  const campos = somenteEnviados(corpoDa(req), {
    nome: (v) => texto(v, "nome", 80),
    alvo: (v) => dinheiro(v, "alvo"),
    guardado: (v) => dinheiro(v, "guardado", 0)
  });

  const [linha] = await sql`
    update metas set
      nome     = coalesce(${campos.nome ?? null}, nome),
      alvo     = coalesce(${campos.alvo ?? null}, alvo),
      guardado = coalesce(${campos.guardado ?? null}, guardado)
    where id = ${id} and usuario_id = ${usuario}
    returning id`;

  if (!linha) return responde(res, 404, { erro: "não encontrado" });
  responde(res, 200, { id, ...campos });
});
