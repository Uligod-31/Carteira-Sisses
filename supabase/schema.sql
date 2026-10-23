-- Caderneta: tabelas cf_* com seguranca por utilizador (RLS).
-- Seguro para voltar a correr: nao apaga nem altera dados existentes.

create table if not exists public.cf_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cf_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null check (char_length(ticker) <= 20),
  nome text not null default '' check (char_length(nome) <= 120),
  classe text not null default 'acoes' check (classe in ('acoes','defensivo','caixa')),
  valor numeric(14,2) not null default 0,
  ganho numeric(14,2) not null default 0,
  alvo_pct numeric(5,2) not null default 0 check (alvo_pct between 0 and 100),
  ordem int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.cf_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  valor numeric(14,2) not null,
  depositado numeric(14,2) not null,
  unique (user_id, data)
);

create table if not exists public.cf_aportes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  valor numeric(14,2) not null check (valor > 0),
  ticker text not null default '' check (char_length(ticker) <= 20),
  nota text not null default '' check (char_length(nota) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.cf_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null default 'nota' check (tipo in ('nota','decisao','pendente','rejeitado','revisao')),
  data date,
  texto text not null check (char_length(texto) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.cf_budget (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('despesa','poupanca')),
  nome text not null check (char_length(nome) between 1 and 120),
  valor numeric(14,2) not null default 0
);

create table if not exists public.cf_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  alvo numeric(14,2) not null check (alvo > 0),
  prazo date,
  base text not null default 'pie' check (base in ('pie','patrimonio'))
);

create table if not exists public.cf_radar_refs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null check (char_length(ticker) <= 20),
  fonte text not null check (fonte in ('justetf','trackinsight','emissor')),
  campo text not null check (campo in ('ter','aum_m','dd_5a','dd_max','ytd','replicacao','indice')),
  valor_num numeric(16,4),
  valor_txt text check (char_length(valor_txt) <= 200),
  data_ref date not null,
  url text check (url is null or url ~ '^https://'),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker, fonte, campo)
);

create index if not exists cf_holdings_user_idx on public.cf_holdings (user_id);
create index if not exists cf_snapshots_user_idx on public.cf_snapshots (user_id, data);
create index if not exists cf_aportes_user_idx on public.cf_aportes (user_id, data);
create index if not exists cf_notes_user_idx on public.cf_notes (user_id, created_at desc);
create index if not exists cf_budget_user_idx on public.cf_budget (user_id);
create index if not exists cf_goals_user_idx on public.cf_goals (user_id);
create index if not exists cf_radar_refs_user_idx on public.cf_radar_refs (user_id, ticker);

do $$
declare t text;
begin
  foreach t in array array['cf_settings','cf_holdings','cf_snapshots','cf_aportes','cf_notes','cf_budget','cf_goals','cf_radar_refs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_own', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
