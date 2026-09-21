/** PATCH e DELETE /api/compromissos/:id */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { usuarioDa } from "../../lib/auth";
import { rota, responde, corpoDa, idDa } from "../../lib/http";
import { texto, dinheiro, data, dentro, booleano, somenteEnviados } from "../../lib/validacao";

export default rota(["PATCH", "DELETE"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = await usuarioDa(req);
  const id = idDa(req);

  if (req.method === "DELETE") {
    const apagados = await sql`
      delete from compromissos where id = ${id} and usuario_id = ${usuario} returning id`;
    if (!apagados.length) return responde(res, 404, { erro: "não encontrado" });
    return responde(res, 200, { id });
  }

  const campos = somenteEnviados(corpoDa(req), {
    desc: (v) => texto(v, "desc"),
    valor: (v) => dinheiro(v, "valor"),
    venc: (v) => data(v, "venc"),
    rec: (v) => dentro(v, "rec", ["unico", "mensal"] as const),
    pago: (v) => booleano(v, "pago")
  });

  const [linha] = await sql`
    update compromissos set
      descricao   = coalesce(${campos.desc ?? null}, descricao),
      valor       = coalesce(${campos.valor ?? null}, valor),
      vencimento  = coalesce(${campos.venc ?? null}, vencimento),
      recorrencia = coalesce(${campos.rec ?? null}, recorrencia),
      pago        = coalesce(${campos.pago ?? null}, pago)
    where id = ${id} and usuario_id = ${usuario}
    returning id`;

  if (!linha) return responde(res, 404, { erro: "não encontrado" });
  responde(res, 200, { id, ...campos });
});
