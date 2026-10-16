-- Resting orders for the paper bot: "buy NVDA if it pulls back to $210 by Friday".
-- The checker (every 10 min in the session) fills one when the underlying reaches its trigger,
-- pricing and rule-checking it exactly like an immediate order.

create table public.bot_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  idea_id uuid references public.trades (id) on delete cascade,
  ticker text not null check (ticker = upper(ticker) and length(ticker) between 1 and 12),
  kind text not null check (kind in ('stock', 'call', 'put', 'call_spread', 'put_spread')),
  spec text,
  qty numeric not null check (qty > 0),
  stop numeric not null,
  target numeric not null,
  exit_by date not null,
  reasoning text not null,
  trigger_type text not null check (trigger_type in ('at_or_below', 'at_or_above')),
  trigger_price numeric not null,
  max_price numeric,               -- per share; above it the order keeps waiting
  good_until date not null,
  status text not null default 'pending' check (status in ('pending', 'filled', 'cancelled', 'expired', 'rejected')),
  resolved_at timestamptz,
  note text,                       -- why it was cancelled, expired or rejected
  position_id uuid references public.bot_positions (id) on delete set null
);
create index bot_orders_status_idx on public.bot_orders (status, created_at desc);
create index bot_orders_idea_idx on public.bot_orders (idea_id);
create index bot_orders_position_idx on public.bot_orders (position_id);
-- One pending order per ticker.
create unique index bot_orders_pending_ticker_idx on public.bot_orders (ticker) where status = 'pending';

alter table public.bot_orders enable row level security;
create policy "allowed users read" on public.bot_orders for select to authenticated using (private.is_allowed());

-- Decisions can now also be a resting order being placed or cancelled.
alter table public.bot_decisions drop constraint bot_decisions_verdict_check;
alter table public.bot_decisions add constraint bot_decisions_verdict_check check (verdict in ('take', 'skip', 'wait', 'rejected', 'order', 'cancel'));
alter table public.bot_decisions add column order_id uuid references public.bot_orders (id) on delete set null;
create index bot_decisions_order_idx on public.bot_decisions (order_id);
