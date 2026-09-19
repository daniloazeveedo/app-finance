-- Esquema inicial do Caixa.
-- Rode uma vez no SQL Editor do Neon.

create table if not exists lancamentos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  text        not null,
  descricao   text        not null,
  valor       numeric(12,2) not null check (valor > 0),
  tipo        text        not null check (tipo in ('entrada','saida')),
  categoria   text        not null,
  data        date        not null,
  criado_em   timestamptz not null default now()
);

create table if not exists compromissos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  text        not null,
  descricao   text        not null,
  valor       numeric(12,2) not null check (valor > 0),
  vencimento  date        not null,
  recorrencia text        not null default 'unico' check (recorrencia in ('unico','mensal')),
  pago        boolean     not null default false,
  criado_em   timestamptz not null default now()
);

create table if not exists metas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  text        not null,
  nome        text        not null,
  alvo        numeric(12,2) not null check (alvo > 0),
  guardado    numeric(12,2) not null default 0 check (guardado >= 0),
  criado_em   timestamptz not null default now()
);

-- Toda consulta filtra por usuário; estes índices sustentam isso.
create index if not exists idx_lanc_usuario   on lancamentos  (usuario_id, data desc);
create index if not exists idx_comp_usuario   on compromissos (usuario_id, vencimento);
create index if not exists idx_metas_usuario  on metas        (usuario_id, criado_em);
