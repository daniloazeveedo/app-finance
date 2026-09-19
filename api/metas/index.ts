/** POST /api/metas — cria uma meta de compra. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { usuarioDa } from "../../lib/auth";
import { rota, responde, corpoDa } from "../../lib/http";
import { texto, dinheiro } from "../../lib/validacao";

export default rota(["POST"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = usuarioDa(req);
  const c = corpoDa(req);

  const nova = {
    nome: texto(c.nome, "nome", 80),
    alvo: dinheiro(c.alvo, "alvo"),
    guardado: c.guardado === undefined ? 0 : dinheiro(c.guardado, "guardado", 0)
  };

  const [linha] = await sql`
    insert into metas (usuario_id, nome, alvo, guardado)
    values (${usuario}, ${nova.nome}, ${nova.alvo}, ${nova.guardado})
    returning id`;

  responde(res, 201, { id: linha.id, ...nova });
});
