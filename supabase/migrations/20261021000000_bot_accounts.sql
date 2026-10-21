-- Two paper accounts: "steady" (the original, id 1) and "aggressive" (id 2, finds its own trades,
-- no size limits). Each has a rule profile (packages/desk/src/bot.ts BOT_PROFILES); every bot
-- table gets an account_id. Existing rows belong to steady (account_id defaults to 1).

alter table public.bot_account drop constraint bot_account_id_check;
alter table public.bot_account alter column id drop default;
alter table public.bot_account add column slug text, add column name text, add column profile text;
update public.bot_account set slug = 'steady', name = 'Steady', profile = 'steady' where id = 1;
alter table public.bot_account
  alter column slug set not null,
  alter column name set not null,
  alter column profile set not null,
  add constraint bot_account_slug_key unique (slug),
  add constraint bot_account_profile_check check (profile in ('steady', 'aggressive'));
insert into public.bot_account (id, slug, name, profile, starting_cash) values (2, 'aggressive', 'Aggressive', 'aggressive', 5000)
on conflict (id) do nothing;

alter table public.bot_positions add column account_id int not null default 1 references public.bot_account (id);
alter table public.bot_decisions add column account_id int not null default 1 references public.bot_account (id);
alter table public.bot_orders add column account_id int not null default 1 references public.bot_account (id);
alter table public.bot_marks add column account_id int not null default 1 references public.bot_account (id);
create index bot_positions_account_idx on public.bot_positions (account_id, status);
create index bot_decisions_account_idx on public.bot_decisions (account_id, date desc);
create index bot_orders_account_idx on public.bot_orders (account_id, status);

-- One open position / one pending order per ticker, per account.
drop index public.bot_positions_open_ticker_idx;
create unique index bot_positions_open_ticker_idx on public.bot_positions (account_id, ticker) where status = 'open';
drop index public.bot_orders_pending_ticker_idx;
create unique index bot_orders_pending_ticker_idx on public.bot_orders (account_id, ticker) where status = 'pending';

-- One snapshot per account per day.
alter table public.bot_marks drop constraint bot_marks_pkey;
alter table public.bot_marks add primary key (account_id, date);
