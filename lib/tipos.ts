/** Formatos trocados entre o front-end e a API. */

export type Tipo = "entrada" | "saida";
export type Recorrencia = "unico" | "mensal";

export interface Lancamento {
  id: string;
  desc: string;
  valor: number;
  tipo: Tipo;
  cat: string;
  data: string; // AAAA-MM-DD
}

export interface Compromisso {
  id: string;
  desc: string;
  valor: number;
  venc: string; // AAAA-MM-DD
  rec: Recorrencia;
  pago: boolean;
}

export interface Meta {
  id: string;
  nome: string;
  alvo: number;
  guardado: number;
}

export interface Dados {
  lancamentos: Lancamento[];
  compromissos: Compromisso[];
  metas: Meta[];
}

/** Nomes das coleções na URL: /api/<colecao>. */
export const COLECOES = ["lancamentos", "compromissos", "metas"] as const;
export type Colecao = (typeof COLECOES)[number];
