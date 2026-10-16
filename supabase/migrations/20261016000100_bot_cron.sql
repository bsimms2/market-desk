-- The paper bot's checker: every 10 minutes on weekdays, 9:00 AM to 5:59 PM New York in either
-- daylight-saving state (13:00-21:59 UTC), call agent-api ?action=bot_check. The function decides
-- what to do from the market session: mark and close positions while the market is open, and
-- write the day's snapshot after the close. Outside those times it does nothing.
--
-- The token comes from Vault (secret 'desk_agent_token', the same DESK_AGENT_TOKEN as .env),
-- added outside this file so it never lands in the repo:
--   select vault.create_secret('<token>', 'desk_agent_token');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'bot-check',
  '*/10 13-21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://lomsjeahhiyforjnwbtu.supabase.co/functions/v1/agent-api?action=bot_check',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-desk-token', (select decrypted_secret from vault.decrypted_secrets where name = 'desk_agent_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
