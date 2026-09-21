/** Garante que as tabelas existem no MESMO banco que o app usa.
 *
 *  Roda uma vez por instância da função, na primeira requisição. Na maioria
 *  das vezes é uma consulta só (tudo já existe) e segue a vida. Se faltar
 *  algo, cria. Tudo é "if not exists": rodar de novo não apaga nada. */
import { sql } from "./db";

const CONFERE = `
  select to_regclass('public.usuarios') is not null
     and to_regclass('public.sessoes') is not null
     and to_regclass('public.lancamentos') is not null
     and to_regclass('public.compromissos') is not null
     and to_regclass('public.metas') is not null
     and not exists (
       select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name in ('lancamentos','compromissos','metas')
          and column_name = 'usuario_id' and data_type = 'text'
     ) as ok`;

const PASSOS: string[] = [
  `create table if not exists usuarios (
     id          uuid primary key default gen_random_uuid(),
     nome        text        not null,
     email       text        not null,
     senha_hash  text        not null,
     criado_em   timestamptz not null default now())`,
  `create unique index if not exists idx_usuarios_email on usuarios (lower(email))`,

  `create table if not exists sessoes (
     token_hash  text        primary key,
     usuario_id  uuid        not null references usuarios(id) on delete cascade,
     criada_em   timestamptz not null default now(),
     expira_em   timestamptz not null)`,
  `create index if not exists idx_sessoes_usuario on sessoes (usuario_id)`,
  `create index if not exists idx_sessoes_expira  on sessoes (expira_em)`,

  `create table if not exists lancamentos (
     id          uuid primary key default gen_random_uuid(),
     usuario_id  uuid        not null references usuarios(id) on delete cascade,
     descricao   text        not null,
     valor       numeric(12,2) not null check (valor > 0),
     tipo        text        not null check (tipo in ('entrada','saida')),
     categoria   text        not null,
     data        date        not null,
     criado_em   timestamptz not null default now())`,
  `create table if not exists compromissos (
     id          uuid primary key default gen_random_uuid(),
     usuario_id  uuid        not null references usuarios(id) on delete cascade,
     descricao   text        not null,
     valor       numeric(12,2) not null check (valor > 0),
     vencimento  date        not null,
     recorrencia text        not null default 'unico' check (recorrencia in ('unico','mensal')),
     pago        boolean     not null default false,
     criado_em   timestamptz not null default now())`,
  `create table if not exists metas (
     id          uuid primary key default gen_random_uuid(),
     usuario_id  uuid        not null references usuarios(id) on delete cascade,
     nome        text        not null,
     alvo        numeric(12,2) not null check (alvo > 0),
     guardado    numeric(12,2) not null default 0 check (guardado >= 0),
     criado_em   timestamptz not null default now())`,

  /* Bancos criados pelo 001 antigo guardam usuario_id como texto, sem dono
     real (o login nunca funcionou lá). Só nesse caso converte. */
  `do $$
   declare t text;
   begin
     foreach t in array array['lancamentos','compromissos','metas'] loop
       if exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t
                     and column_name = 'usuario_id' and data_type = 'text') then
         execute format('delete from %I', t);
         execute format('alter table %I drop column usuario_id', t);
         execute format('alter table %I add column usuario_id uuid not null references usuarios(id) on delete cascade', t);
       end if;
     end loop;
   end $$`,

  `create index if not exists idx_lanc_usuario  on lancamentos  (usuario_id, data desc)`,
  `create index if not exists idx_comp_usuario  on compromissos (usuario_id, vencimento)`,
  `create index if not exists idx_metas_usuario on metas        (usuario_id, criado_em)`
];

let pronto: Promise<void> | null = null;

export function garanteEsquema(): Promise<void> {
  if (!pronto) {
    pronto = (async () => {
      const [linha] = await sql.query(CONFERE);
      if (linha && linha.ok) return;
      for (const passo of PASSOS) await sql.query(passo);
      console.log("[esquema] tabelas criadas ou atualizadas");
    })().catch((e) => {
      pronto = null; // tenta de novo na próxima requisição
      throw e;
    });
  }
  return pronto;
}
