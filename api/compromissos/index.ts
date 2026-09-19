/** POST /api/compromissos — cria uma conta com vencimento. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { usuarioDa } from "../../lib/auth";
import { rota, responde, corpoDa } from "../../lib/http";
import { texto, dinheiro, data, dentro } from "../../lib/validacao";

export default rota(["POST"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = usuarioDa(req);
  const c = corpoDa(req);

  const novo = {
    desc: texto(c.desc, "desc"),
    valor: dinheiro(c.valor, "valor"),
    venc: data(c.venc, "venc"),
    rec: c.rec === undefined ? "unico" : dentro(c.rec, "rec", ["unico", "mensal"] as const)
  };

  const [linha] = await sql`
    insert into compromissos (usuario_id, descricao, valor, vencimento, recorrencia, pago)
    values (${usuario}, ${novo.desc}, ${novo.valor}, ${novo.venc}, ${novo.rec}, false)
    returning id`;

  responde(res, 201, { id: linha.id, ...novo, pago: false });
});
