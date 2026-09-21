/** PATCH e DELETE /api/lancamentos/:id
 *  O usuario_id entra no WHERE: ninguém edita o registro de outro. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { usuarioDa } from "../../lib/auth";
import { rota, responde, corpoDa, idDa } from "../../lib/http";
import { texto, dinheiro, data, dentro, somenteEnviados } from "../../lib/validacao";

export default rota(["PATCH", "DELETE"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = await usuarioDa(req);
  const id = idDa(req);

  if (req.method === "DELETE") {
    const apagados = await sql`
      delete from lancamentos where id = ${id} and usuario_id = ${usuario} returning id`;
    if (!apagados.length) return responde(res, 404, { erro: "não encontrado" });
    return responde(res, 200, { id });
  }

  const campos = somenteEnviados(corpoDa(req), {
    desc: (v) => texto(v, "desc"),
    valor: (v) => dinheiro(v, "valor"),
    tipo: (v) => dentro(v, "tipo", ["entrada", "saida"] as const),
    cat: (v) => texto(v, "cat", 40),
    data: (v) => data(v, "data")
  });

  const [linha] = await sql`
    update lancamentos set
      descricao = coalesce(${campos.desc ?? null}, descricao),
      valor     = coalesce(${campos.valor ?? null}, valor),
      tipo      = coalesce(${campos.tipo ?? null}, tipo),
      categoria = coalesce(${campos.cat ?? null}, categoria),
      data      = coalesce(${campos.data ?? null}, data)
    where id = ${id} and usuario_id = ${usuario}
    returning id`;

  if (!linha) return responde(res, 404, { erro: "não encontrado" });
  responde(res, 200, { id, ...campos });
});
