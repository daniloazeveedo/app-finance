/** GET /api/auth/eu — quem está logado. É o que o app pergunta ao abrir. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { usuarioDa } from "../../lib/auth";
import { rota, responde } from "../../lib/http";

export default rota(["GET"], async (req: VercelRequest, res: VercelResponse) => {
  const id = await usuarioDa(req);
  const [u] = await sql`select id, nome, email from usuarios where id = ${id}`;
  if (!u) return responde(res, 401, { erro: "não autorizado" });
  res.setHeader("Cache-Control", "no-store");
  responde(res, 200, { id: u.id, nome: u.nome, email: u.email });
});
