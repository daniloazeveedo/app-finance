/** Sessão por token opaco guardado em tabela.
 *
 *  Escolhi token opaco em vez de JWT porque dá para revogar (basta apagar a
 *  linha), não depende de acertar detalhes de assinatura, e o custo é uma
 *  consulta a mais por requisição — irrelevante nesta escala. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes } from "crypto";
import { sql } from "./db";

const COOKIE = "caixa_sessao";
const DIAS = 30;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function abre(res: VercelResponse, usuarioId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DIAS * 86400_000);

  await sql`insert into sessoes (token_hash, usuario_id, expira_em)
            values (${hash(token)}, ${usuarioId}, ${expira.toISOString()})`;

  res.setHeader("Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DIAS * 86400}`);
}

export function tokenDe(req: VercelRequest): string | null {
  const bruto = req.headers.cookie;
  if (!bruto) return null;
  for (const parte of bruto.split(";")) {
    const [nome, ...resto] = parte.trim().split("=");
    if (nome === COOKIE) return resto.join("=") || null;
  }
  return null;
}

export async function dona(req: VercelRequest): Promise<string | null> {
  const token = tokenDe(req);
  if (!token) return null;

  const [linha] = await sql`
    select usuario_id from sessoes
     where token_hash = ${hash(token)} and expira_em > now()`;

  return linha ? (linha.usuario_id as string) : null;
}

export async function fecha(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = tokenDe(req);
  if (token) await sql`delete from sessoes where token_hash = ${hash(token)}`;
  res.setHeader("Set-Cookie",
    `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

/** Faxina oportunista das sessões vencidas. */
export async function limpa(): Promise<void> {
  try { await sql`delete from sessoes where expira_em < now()`; } catch { /* ignora */ }
}
