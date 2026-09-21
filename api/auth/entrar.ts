/** POST /api/auth/entrar — valida a senha e abre a sessão. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { rota, responde, corpoDa } from "../../lib/http";
import { confere } from "../../lib/senha";
import { abre, limpa } from "../../lib/sessao";

export default rota(["POST"], async (req: VercelRequest, res: VercelResponse) => {
  const c = corpoDa(req);
  const mail = String(c.email ?? "").trim().toLowerCase();
  const senha = String(c.senha ?? "");

  const [usuario] = await sql`
    select id, nome, email, senha_hash from usuarios where lower(email) = ${mail}`;

  // Mensagem única para e-mail inexistente e senha errada: não entregamos
  // a quem tentar a informação de quais e-mails têm conta aqui.
  const ok = usuario ? await confere(senha, usuario.senha_hash as string) : false;
  if (!ok) return responde(res, 401, { erro: "e-mail ou senha incorretos" });

  await abre(res, usuario.id as string);
  limpa();
  responde(res, 200, { id: usuario.id, nome: usuario.nome, email: usuario.email });
});
