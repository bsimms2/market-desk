// Shared copies of rate-limited public feeds (table market_cache), served to the agents.
//
//   GET|POST ?action=econ_calendar[&refresh=1]
//     → { fetched_at, age_minutes, stale, source, events: [...the Forex Factory weekly feed] }
//
// Forex Factory's weekly calendar refuses (429) requests from the busy cloud IPs the routines run
// on, so the agents read our copy instead. A copy under 2 hours old is served as is; an older one
// is refetched, and if that fails the old copy is served with stale: true rather than nothing.
// pg_cron calls it with refresh=1 a few times a day to keep it warm.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Json = (body: unknown, status?: number) => Response;

const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export async function econCalendar(db: SupabaseClient, url: URL, json: Json): Promise<Response> {
  const cached = await db.from("market_cache").select("fetched_at,body").eq("key", "ff_week").maybeSingle();
  const age = cached.data ? Date.now() - Date.parse(cached.data.fetched_at) : Infinity;
  const force = url.searchParams.get("refresh") === "1";
  const serve = (row: { fetched_at: string; body: unknown }, stale: boolean, note?: string) =>
    json({
      fetched_at: row.fetched_at,
      age_minutes: Math.round((Date.now() - Date.parse(row.fetched_at)) / 60_000),
      stale,
      source: "Forex Factory weekly calendar (cached by agent-api)",
      ...(note ? { note } : {}),
      events: row.body,
    });

  if (cached.data && age < MAX_AGE_MS && !force) return serve(cached.data, false);

  let problem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(FF_URL, { headers: { "user-agent": "Mozilla/5.0 MarketDesk" } });
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body) && body.length) {
          const row = { key: "ff_week", fetched_at: new Date().toISOString(), body };
          const up = await db.from("market_cache").upsert(row);
          if (up.error) problem = up.error.message;
          return serve(row, false);
        }
        problem = "empty feed";
      } else problem = `HTTP ${res.status}`;
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
  }
  if (cached.data) return serve(cached.data, true, `refresh failed (${problem}); serving the last good copy`);
  return json({ error: `calendar unavailable: ${problem}` }, 502);
}
