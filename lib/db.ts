/** Conexão com o Postgres do Neon.
 *  O driver serverless fala HTTP, então não segura conexão aberta entre
 *  invocações — que é justamente o que funções serverless precisam. */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL não definida. Conecte o Neon ao projeto na Vercel ou preencha o .env"
  );
}

export const sql = neon(url);

/** O Postgres devolve numeric como string, para não perder precisão.
 *  Converte na saída, já que o front trabalha com números. */
export function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** Datas saem como Date do driver; o front espera AAAA-MM-DD. */
export function dia(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}
