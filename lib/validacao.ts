/** Validação do que chega do cliente.
 *  Regra: nada do corpo da requisição vai para o banco sem passar por aqui. */

export class DadoInvalido extends Error {}

function erro(campo: string, motivo: string): never {
  throw new DadoInvalido(`${campo}: ${motivo}`);
}

export function texto(v: unknown, campo: string, max = 120): string {
  if (typeof v !== "string") erro(campo, "precisa ser texto");
  const t = (v as string).trim();
  if (!t) erro(campo, "não pode ficar vazio");
  if (t.length > max) erro(campo, `passa de ${max} caracteres`);
  return t;
}

export function dinheiro(v: unknown, campo: string, minimo = 0.01): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) erro(campo, "precisa ser número");
  if (n < minimo) erro(campo, `precisa ser pelo menos ${minimo}`);
  if (n > 999_999_999) erro(campo, "valor absurdo");
  return Math.round(n * 100) / 100;
}

export function data(v: unknown, campo: string): string {
  const t = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) erro(campo, "use o formato AAAA-MM-DD");
  const d = new Date(t + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) erro(campo, "data inexistente");
  return t;
}

export function dentro<T extends string>(v: unknown, campo: string, opcoes: readonly T[]): T {
  const t = String(v ?? "") as T;
  if (!opcoes.includes(t)) erro(campo, `precisa ser um de: ${opcoes.join(", ")}`);
  return t;
}

export function booleano(v: unknown, campo: string): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return erro(campo, "precisa ser true ou false");
}

/** Monta um UPDATE parcial: só os campos que vieram no corpo. */
export function somenteEnviados<T extends object>(
  corpo: Record<string, unknown>,
  regras: { [K in keyof T]: (v: unknown) => T[K] }
): Partial<T> {
  const saida: Partial<T> = {};
  for (const campo of Object.keys(regras) as (keyof T)[]) {
    if (corpo[campo as string] !== undefined) {
      saida[campo] = regras[campo](corpo[campo as string]);
    }
  }
  if (Object.keys(saida).length === 0) {
    throw new DadoInvalido("nenhum campo conhecido foi enviado");
  }
  return saida;
}
