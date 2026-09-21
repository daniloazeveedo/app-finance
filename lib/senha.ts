/** Hash de senha com scrypt, que vem no próprio Node — sem dependência.
 *  scrypt é lento e usa memória de propósito: força bruta fica cara. */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

// O cast solta o tipo do sal: @types/node e o TS divergem sobre
// Buffer vs Uint8Array nesta sobrecarga, e isso não muda o comportamento.
const scrypt = promisify(scryptCb) as (
  senha: string, sal: unknown, tamanho: number
) => Promise<Buffer>;

const TAMANHO = 32;

export async function embaralha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scrypt(senha, sal, TAMANHO);
  return `scrypt$${sal.toString("hex")}$${chave.toString("hex")}`;
}

export async function confere(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, salHex, chaveHex] = String(guardado).split("$");
  if (algoritmo !== "scrypt" || !salHex || !chaveHex) return false;

  const esperada = Buffer.from(chaveHex, "hex");
  const calculada = await scrypt(senha, Buffer.from(salHex, "hex"), esperada.length);

  // Comparação em tempo constante: o tempo de resposta não revela
  // quantos bytes bateram antes de falhar.
  if (esperada.length !== calculada.length) return false;
  return timingSafeEqual(
    Uint8Array.from(esperada) as never, Uint8Array.from(calculada) as never);
}
