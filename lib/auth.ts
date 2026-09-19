/** Dono dos dados da requisição.
 *
 *  Hoje devolve sempre o mesmo usuário, vindo de variável de ambiente.
 *  Quando o login entrar, só este arquivo muda: valide o token aqui e
 *  devolva o id do usuário autenticado. O resto da API não precisa saber
 *  de onde o id veio — todas as consultas já filtram por usuario_id. */
import type { VercelRequest } from "@vercel/node";

export class NaoAutorizado extends Error {}

export function usuarioDa(req: VercelRequest): string {
  const chaveEsperada = process.env.CHAVE_APP;
  if (chaveEsperada) {
    const enviada = req.headers["x-chave"];
    if (enviada !== chaveEsperada) {
      throw new NaoAutorizado("Chave ausente ou inválida");
    }
  }
  const usuario = process.env.USUARIO_PADRAO;
  if (!usuario) throw new NaoAutorizado("USUARIO_PADRAO não configurada");
  return usuario;
}
