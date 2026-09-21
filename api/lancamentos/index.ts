/** POST /api/lancamentos — cria um lançamento. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { usuarioDa } from "../../lib/auth";
import { rota, responde, corpoDa } from "../../lib/http";
import { texto, dinheiro, data, dentro } from "../../lib/validacao";

export default rota(["POST"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = await usuarioDa(req);
  const c = corpoDa(req);

  const novo = {
    desc: texto(c.desc, "desc"),
    valor: dinheiro(c.valor, "valor"),
    tipo: dentro(c.tipo, "tipo", ["entrada", "saida"] as const),
    cat: texto(c.cat, "cat", 40),
    data: data(c.data, "data")
  };

  const [linha] = await sql`
    insert into lancamentos (usuario_id, descricao, valor, tipo, categoria, data)
    values (${usuario}, ${novo.desc}, ${novo.valor}, ${novo.tipo}, ${novo.cat}, ${novo.data})
    returning id`;

  responde(res, 201, { id: linha.id, ...novo });
});
