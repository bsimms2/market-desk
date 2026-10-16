-- The agent's check-ins on live ideas and open trades. Insert-only from the agent:
-- it labels a trade (on track / at risk / invalidated / ...), it never changes the trade.
create table public.trade_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  briefing_id uuid references public.briefings (id) on delete set null,
  date date not null,
  verdict text not null check (verdict in ('on_track', 'at_risk', 'invalidated', 'target_hit', 'entry_missed', 'stale')),
  price numeric,
  note text not null
);
create unique index trade_checks_trade_briefing_idx on public.trade_checks (trade_id, briefing_id);
create index trade_checks_trade_date_idx on public.trade_checks (trade_id, date desc);
create index trade_checks_briefing_idx on public.trade_checks (briefing_id);
alter table public.trade_checks enable row level security;
create policy "allowed users" on public.trade_checks for all to authenticated using (private.is_allowed()) with check (private.is_allowed());
