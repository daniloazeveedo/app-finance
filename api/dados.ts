/** GET /api/dados — devolve as três coleções do usuário numa chamada só.
 *  O app precisa das três ao abrir; três requisições seriam desperdício. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, num, dia } from "../lib/db";
import { usuarioDa } from "../lib/auth";
import { rota, responde } from "../lib/http";
import type { Dados } from "../lib/tipos";

export default rota(["GET"], async (req: VercelRequest, res: VercelResponse) => {
  const usuario = usuarioDa(req);

  const [lancamentos, compromissos, metas] = await Promise.all([
    sql`select id, descricao, valor, tipo, categoria, data
          from lancamentos where usuario_id = ${usuario} order by data desc`,
    sql`select id, descricao, valor, vencimento, recorrencia, pago
          from compromissos where usuario_id = ${usuario} order by vencimento`,
    sql`select id, nome, alvo, guardado
          from metas where usuario_id = ${usuario} order by criado_em`
  ]);

  const saida: Dados = {
    lancamentos: lancamentos.map((r: any) => ({
      id: r.id, desc: r.descricao, valor: num(r.valor),
      tipo: r.tipo, cat: r.categoria, data: dia(r.data)
    })),
    compromissos: compromissos.map((r: any) => ({
      id: r.id, desc: r.descricao, valor: num(r.valor),
      venc: dia(r.vencimento), rec: r.recorrencia, pago: r.pago
    })),
    metas: metas.map((r: any) => ({
      id: r.id, nome: r.nome, alvo: num(r.alvo), guardado: num(r.guardado)
    }))
  };

  res.setHeader("Cache-Control", "no-store");
  responde(res, 200, saida);
});
