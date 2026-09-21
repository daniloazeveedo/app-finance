-- Contas de usuário e sessões.
--
-- ATENÇÃO: este script troca o usuario_id das tabelas de texto para uma
-- referência real à tabela de usuários, e apaga as linhas antigas que não
-- pertencem a nenhum usuário. Rode só se os dados atuais forem de teste.
-- Se já houver dados que você queira manter, me avise antes.

create table if not exists usuarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text        not null,
  email       text        not null,
  senha_hash  text        not null,
  criado_em   timestamptz not null default now()
);

-- E-mail é comparado sempre em minúsculas; o índice garante unicidade real.
create unique index if not exists idx_usuarios_email on usuarios (lower(email));

-- Sessão é um token opaco. Guardamos só o hash: se o banco vazar,
-- ninguém consegue reconstruir o cookie de ninguém.
create table if not exists sessoes (
  token_hash  text        primary key,
  usuario_id  uuid        not null references usuarios(id) on delete cascade,
  criada_em   timestamptz not null default now(),
  expira_em   timestamptz not null
);

create index if not exists idx_sessoes_usuario on sessoes (usuario_id);
create index if not exists idx_sessoes_expira  on sessoes (expira_em);

-- Liga os dados existentes a usuários de verdade.
do $$
declare t text;
begin
  foreach t in array array['lancamentos','compromissos','metas'] loop
    execute format('delete from %I', t);
    execute format('alter table %I drop column if exists usuario_id', t);
    execute format(
      'alter table %I add column usuario_id uuid not null references usuarios(id) on delete cascade', t);
  end loop;
end $$;

create index if not exists idx_lanc_usuario  on lancamentos  (usuario_id, data desc);
create index if not exists idx_comp_usuario  on compromissos (usuario_id, vencimento);
create index if not exists idx_metas_usuario on metas        (usuario_id, criado_em);
