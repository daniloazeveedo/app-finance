/** Dono dos dados da requisição — agora vindo da sessão, não de variável
 *  de ambiente. Toda rota de dados passa por aqui antes de tocar no banco. */
import type { VercelRequest } from "@vercel/node";
import { dona } from "./sessao";

export class NaoAutorizado extends Error {}

export async function usuarioDa(req: VercelRequest): Promise<string> {
  const id = await dona(req);
  if (!id) throw new NaoAutorizado("sessão ausente ou expirada");
  return id;
}
