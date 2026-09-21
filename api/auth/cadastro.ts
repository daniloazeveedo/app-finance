/** POST /api/auth/cadastro — cria a conta e já deixa a pessoa dentro. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db";
import { rota, responde, corpoDa } from "../../lib/http";
import { texto, DadoInvalido } from "../../lib/validacao";
import { embaralha } from "../../lib/senha";
import { abre } from "../../lib/sessao";

function email(v: unknown): string {
  const e = texto(v, "email", 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new DadoInvalido("e-mail inválido");
  return e;
}

function senha(v: unknown): string {
  if (typeof v !== "string") throw new DadoInvalido("senha inválida");
  if (v.length < 8) throw new DadoInvalido("a senha precisa de pelo menos 8 caracteres");
  if (v.length > 200) throw new DadoInvalido("senha longa demais");
  return v;
}

export default rota(["POST"], async (req: VercelRequest, res: VercelResponse) => {
  const c = corpoDa(req);
  const nome = texto(c.nome, "nome", 80);
  const mail = email(c.email);
  const hash = await embaralha(senha(c.senha));

  const [existe] = await sql`select 1 from usuarios where lower(email) = ${mail}`;
  if (existe) return responde(res, 409, { erro: "já existe uma conta com esse e-mail" });

  const [novo] = await sql`
    insert into usuarios (nome, email, senha_hash)
    values (${nome}, ${mail}, ${hash})
    returning id, nome, email`;

  await abre(res, novo.id as string);
  responde(res, 201, { id: novo.id, nome: novo.nome, email: novo.email });
});
