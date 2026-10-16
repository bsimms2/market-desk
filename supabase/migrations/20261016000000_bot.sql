-- The paper trading agent ("the bot"): a simulated $5,000 account that a separate trader
-- agent runs on its own, taking or skipping the research desk's ideas.
-- Everything is simulated. Fills are priced by the agent-api edge function from live quotes
-- (buy at the ask, sell at the bid); the agent never supplies a price. No brokerage involved.

-- One row: the account.
create table public.bot_account (
  id int primary key default 1 check (id = 1),
  starting_cash numeric not null default 5000,
  live_pot numeric not null default 2500,
  status text not null default 'active' check (status in ('active', 'paused')),
  paused_reason text,
  -- Set by the first market-hours check, the day trading starts; the SPY comparison runs from here.
  started_on date,
  spy_start numeric,
  updated_at timestamptz not null default now()
);
create trigger bot_account_touch before update on public.bot_account
  for each row execute function public.touch_updated_at();
insert into public.bot_account (id) values (1) on conflict (id) do nothing;

create table public.bot_positions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  idea_id uuid references public.trades (id) on delete set null,
  ticker text not null check (ticker = upper(ticker) and length(ticker) between 1 and 12),
  kind text not null check (kind in ('stock', 'call', 'put', 'call_spread', 'put_spread')),
  spec text,                       -- option spec, e.g. NVDA:2026-11-20:220/230C; null for stock
  qty numeric not null check (qty > 0),
  entry_price numeric not null,    -- per share (options: premium per share)
  entry_underlying numeric not null,
  cost numeric not null,           -- dollars paid; for debit options also the max loss
  stop numeric not null,           -- on the underlying
  target numeric not null,         -- on the underlying
  exit_by date not null,
  reasoning text not null,
  fits_live boolean not null,      -- within the $2,500 live account's limits
  live_eligible boolean not null,  -- a structure the live account can trade (not a spread, until confirmed)
  status text not null default 'open' check (status in ('open', 'closed')),
  mark numeric,                    -- latest value per share (options: mid)
  mark_underlying numeric,
  marked_at timestamptz,
  closed_at timestamptz,
  exit_price numeric,
  exit_underlying numeric,
  exit_reason text check (exit_reason in ('stop', 'target', 'time', 'agent', 'expiry')),
  exit_note text,
  pnl numeric
);
create index bot_positions_status_idx on public.bot_positions (status, created_at desc);
-- At most one open position per ticker.
create unique index bot_positions_open_ticker_idx on public.bot_positions (ticker) where status = 'open';
create index bot_positions_idea_idx on public.bot_positions (idea_id);

-- The trader agent's verdict on each research idea, every time it looks at one.
create table public.bot_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  idea_id uuid references public.trades (id) on delete cascade,
  ticker text not null,
  verdict text not null check (verdict in ('take', 'skip', 'wait', 'rejected')),
  reasoning text not null,
  position_id uuid references public.bot_positions (id) on delete set null
);
create index bot_decisions_date_idx on public.bot_decisions (date desc, created_at desc);
create index bot_decisions_idea_idx on public.bot_decisions (idea_id);
create index bot_decisions_position_idx on public.bot_decisions (position_id);

-- End-of-day snapshot for the equity-vs-SPY comparison.
create table public.bot_marks (
  date date primary key,
  created_at timestamptz not null default now(),
  equity numeric not null,
  cash numeric not null,
  open_value numeric not null,
  spy numeric
);

alter table public.bot_account enable row level security;
alter table public.bot_positions enable row level security;
alter table public.bot_decisions enable row level security;
alter table public.bot_marks enable row level security;
-- Brendan reads everything; the only thing the app changes is the account (resume after the kill switch).
create policy "allowed users read" on public.bot_positions for select to authenticated using (private.is_allowed());
create policy "allowed users read" on public.bot_decisions for select to authenticated using (private.is_allowed());
create policy "allowed users read" on public.bot_marks for select to authenticated using (private.is_allowed());
create policy "allowed users" on public.bot_account for all to authenticated using (private.is_allowed()) with check (private.is_allowed());
