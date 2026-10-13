-- Market Desk schema. Paper-trade journal, agent briefings, options lessons,
-- and Brendan's real holdings (read-only context for the briefings).
-- Nothing here places orders or connects to a brokerage.

-- ---------------------------------------------------------------------------
-- Who may use the app. Anyone can request a magic link with the public key,
-- so every policy below checks the signed-in email against this table.
create table if not exists public.allowed_users (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums

create type public.track as enum ('swing', 'long');
create type public.direction as enum ('long', 'short');
create type public.instrument as enum ('stock', 'option');
create type public.trade_status as enum ('idea', 'open', 'closed', 'passed');
create type public.briefing_kind as enum ('swing_morning', 'swing_evening', 'long_weekly');
create type public.holding_kind as enum ('stock', 'etf', 'option', 'fund', 'other');

-- ---------------------------------------------------------------------------
-- Briefings: what the agent posts.

create table public.briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind public.briefing_kind not null,
  date date not null,
  title text not null,
  summary text,
  body_md text not null,
  sources jsonb not null default '[]'::jsonb
);
create index briefings_date_idx on public.briefings (date desc, created_at desc);

-- ---------------------------------------------------------------------------
-- Trades: every idea, taken or passed. Paper account only.

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  track public.track not null,
  ticker text not null check (ticker = upper(ticker) and length(ticker) between 1 and 12),
  direction public.direction not null default 'long',
  instrument public.instrument not null default 'stock',
  structure text not null default 'Shares',
  status public.trade_status not null default 'idea',
  thesis text,
  catalyst text,
  catalyst_type text,          -- e.g. earnings, macro, news, sector (weekly review groups by this)
  invalidation text,
  options_angle text,
  entry_plan text,
  target text,
  entry_price numeric,
  exit_price numeric,
  opened_on date,
  closed_on date,
  return_pct numeric,
  lesson text,
  source_briefing_id uuid references public.briefings (id) on delete set null
);
create index trades_track_created_idx on public.trades (track, created_at desc);
create index trades_status_idx on public.trades (status);
create index trades_briefing_idx on public.trades (source_briefing_id);
create trigger trades_touch before update on public.trades
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Lessons library (phase 3).

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  concept text,
  body_md text not null,
  briefing_id uuid references public.briefings (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Holdings: Brendan's real portfolio. Context only; the agent may refresh
-- last_price/last_price_on but never adds, removes or resizes a holding.

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ticker text not null check (ticker = upper(ticker) and length(ticker) between 1 and 12),
  name text,
  kind public.holding_kind not null default 'stock',
  shares numeric not null default 0,
  cost_basis numeric,          -- per share
  account text,
  opened_on date,
  thesis text,
  notes text,
  last_price numeric,
  last_price_on date,
  active boolean not null default true
);
create index holdings_active_idx on public.holdings (active, ticker);
create trigger holdings_touch before update on public.holdings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: only allowed, signed-in users get anything.
-- The agent writes through the agent-api edge function (service role, insert-only).

do $$
declare t text;
begin
  foreach t in array array['allowed_users','briefings','trades','lessons','holdings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "allowed users" on public.%I for all to authenticated using (public.is_allowed()) with check (public.is_allowed())',
      t
    );
  end loop;
end $$;

revoke execute on function public.is_allowed() from anon;

insert into public.allowed_users (email) values ('bsimms1226@gmail.com')
on conflict (email) do nothing;
