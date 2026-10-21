-- Shared copies of rate-limited public feeds, refreshed by agent-api so cloud agents don't hit
-- the source directly. First user: the Forex Factory weekly economic calendar, which refuses
-- (429) requests from the busy cloud IPs the routines run on.
create table public.market_cache (
  key text primary key,
  fetched_at timestamptz not null default now(),
  body jsonb not null
);
alter table public.market_cache enable row level security;
-- No policies: only the service role (agent-api) reads and writes it.

-- Keep it warm: weekdays before the morning briefing and through the day, and Sunday evening
-- for the weekly briefing (the "this week" file rolls over on Sunday).
select cron.schedule(
  'econ-calendar-refresh',
  '0 10,13,17,21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://lomsjeahhiyforjnwbtu.supabase.co/functions/v1/agent-api?action=econ_calendar&refresh=1',
    headers := jsonb_build_object('content-type', 'application/json', 'x-desk-token', (select decrypted_secret from vault.decrypted_secrets where name = 'desk_agent_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
select cron.schedule(
  'econ-calendar-refresh-sunday',
  '0 20 * * 0',
  $$
  select net.http_post(
    url := 'https://lomsjeahhiyforjnwbtu.supabase.co/functions/v1/agent-api?action=econ_calendar&refresh=1',
    headers := jsonb_build_object('content-type', 'application/json', 'x-desk-token', (select decrypted_secret from vault.decrypted_secrets where name = 'desk_agent_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
