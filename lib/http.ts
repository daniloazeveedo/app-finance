/** Casca comum das rotas: CORS, corpo, respostas e tradução de erro.
 *  Mantém cada arquivo de /api cuidando só da sua regra de negócio. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NaoAutorizado } from "./auth";
import { DadoInvalido } from "./validacao";

export type Metodo = "GET" | "POST" | "PATCH" | "DELETE" | "OPTIONS";

export function responde(res: VercelResponse, status: number, corpo: unknown): void {
  res.status(status).json(corpo);
}

/** Na Vercel o site e a API dividem o mesmo domínio, então CORS não é
 *  necessário. Só liberamos outra origem se ORIGEM_PERMITIDA for preenchida
 *  — útil enquanto o front ainda estiver no GitHub Pages. */
function cors(req: VercelRequest, res: VercelResponse): boolean {
  const permitida = process.env.ORIGEM_PERMITIDA;
  if (permitida) {
    res.setHeader("Access-Control-Allow-Origin", permitida);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-chave");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

/** O corpo já vem parseado quando o Content-Type é JSON; o resto é defesa. */
export function corpoDa(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      throw new DadoInvalido("corpo não é JSON válido");
    }
  }
  if (typeof b === "object") return b as Record<string, unknown>;
  throw new DadoInvalido("corpo em formato inesperado");
}

export function idDa(req: VercelRequest): string {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new DadoInvalido("id inválido");
  return id;
}

/** Envolve o handler: trata OPTIONS, filtra métodos e converte exceções
 *  em respostas. Sem isso, um erro do banco vazaria detalhes internos. */
export function rota(
  metodos: Metodo[],
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>
) {
  return async function (req: VercelRequest, res: VercelResponse): Promise<void> {
    if (cors(req, res)) return;

    if (!metodos.includes(req.method as Metodo)) {
      res.setHeader("Allow", metodos.join(", "));
      return responde(res, 405, { erro: "método não permitido" });
    }

    try {
      await handler(req, res);
    } catch (e) {
      if (e instanceof NaoAutorizado) return responde(res, 401, { erro: "não autorizado" });
      if (e instanceof DadoInvalido) return responde(res, 400, { erro: e.message });
      console.error("Falha na rota", req.url, e);
      return responde(res, 500, { erro: "erro interno" });
    }
  };
}
