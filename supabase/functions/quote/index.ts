// Live prices for the app's "Use live price" buttons. Signed-in, allowed users only.
//
//   GET ?symbols=NVDA,AAPL
//     → { quotes: [{ symbol, price, session, ext_price, ext_time, prev_close, day_pct, as_of }] }
//   GET ?spread=NVDA:2026-10-30:220/230C
//     → { spread: { long, short, debit, cost_per_contract, breakeven, underlying, as_of } }
//   GET ?option=NVDA:2026-10-30:220C
//     → { option: { contract, bid, ask, mid, iv_pct, delta, cost_per_contract, underlying, as_of } }
//
// Stock prices come from Yahoo's chart feed (with pre/after-hours bars); option prices from
// CBOE's delayed chain (~15 min). No keys involved. Read-only: this function writes nothing.
// verify_jwt stays on (the gateway rejects anonymous calls) and we also check allowed_users.

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });
}

async function allowed(req: Request): Promise<boolean> {
  // The research agent (and smoke tests) may use the same token as agent-api.
  const deskToken = Deno.env.get("DESK_AGENT_TOKEN");
  if (deskToken && req.headers.get("x-desk-token") === deskToken) return true;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (!email) return false;
  const { data: row } = await admin.from("allowed_users").select("email").ilike("email", email).maybeSingle();
  return !!row;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const nyDate = (sec: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(sec * 1000));
const nyTime = (sec: number) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(sec * 1000));

async function chart(symbol: string, query: string): Promise<any> {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (res.ok) {
      const j = await res.json();
      if (j?.chart?.result?.[0]) return j.chart.result[0];
    }
  }
  throw new Error(`no quote for ${symbol}`);
}

async function stockQuote(symbol: string) {
  try {
    // 5-minute bars including pre/post: the last bar is the latest trade, in any session.
    const r = await chart(symbol, "range=2d&interval=5m&includePrePost=true");
    const m = r.meta ?? {};
    const ts: number[] = r.timestamp ?? [];
    const c: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    let i = c.length - 1;
    while (i >= 0 && typeof c[i] !== "number") i--;
    const now = Date.now() / 1000;
    const p = m.currentTradingPeriod ?? {};
    const session =
      p.regular && now >= p.regular.start && now < p.regular.end ? "regular" : p.pre && now >= p.pre.start && now < p.pre.end ? "pre" : p.post && now >= p.post.start && now < p.post.end ? "post" : "closed";
    const regular = typeof m.regularMarketPrice === "number" ? r2(m.regularMarketPrice) : undefined;
    const last = i >= 0 ? r2(c[i]!) : regular;
    const prev = typeof m.previousClose === "number" ? m.previousClose : m.chartPreviousClose;
    const extended = session === "pre" || session === "post";
    const price = extended ? regular : last;
    return {
      symbol,
      name: m.shortName ?? m.longName,
      price,
      session,
      as_of: m.regularMarketTime ? `${nyDate(m.regularMarketTime)} ${nyTime(m.regularMarketTime)}` : undefined,
      ...(extended && i >= 0 && last !== regular ? { ext_price: last, ext_time: nyTime(ts[i]!) } : {}),
      prev_close: typeof prev === "number" ? r2(prev) : undefined,
      day_pct: price != null && typeof prev === "number" ? r2(((price - prev) / prev) * 100) : undefined,
    };
  } catch (e) {
    return { symbol, error: e instanceof Error ? e.message : String(e) };
  }
}

async function cboeChain(ticker: string) {
  const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${ticker.toUpperCase().replace(".", "-")}.json`, {
    headers: { "user-agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`CBOE ${res.status}`);
  return await res.json();
}

const occOf = (tk: string, exp: string, t: string, k: string) =>
  `${tk.toUpperCase()}${exp.slice(2, 4)}${exp.slice(5, 7)}${exp.slice(8, 10)}${t.toUpperCase()}${String(Math.round(Number(k) * 1000)).padStart(8, "0")}`;
const midOf = (o: any) => (o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : o.last_trade_price);

async function singleQuote(spec: string) {
  const m = spec.match(/^([A-Z.]+):(\d{4}-\d{2}-\d{2}):(\d+(?:\.\d+)?)([CP])$/i);
  if (!m) throw new Error("option format: TICKER:YYYY-MM-DD:STRIKE{C|P}");
  const [, tk, exp, k, t] = m;
  const j = await cboeChain(tk!);
  const o = (j.data.options as any[]).find((x) => x.option === occOf(tk!, exp!, t!, k!));
  if (!o) throw new Error(`no ${t!.toUpperCase()} at ${k} expiring ${exp}`);
  const mid = r2(midOf(o));
  return {
    option: {
      contract: o.option,
      type: t!.toUpperCase() === "C" ? "call" : "put",
      expiry: exp,
      strike: Number(k),
      bid: o.bid,
      ask: o.ask,
      mid,
      iv_pct: r2(o.iv * 100),
      delta: r2(o.delta),
      cost_per_contract: r2(mid * 100),
      underlying: r2(j.data.current_price),
      as_of: j.timestamp,
      delayed: "about 15 minutes",
    },
  };
}

async function spreadQuote(spec: string) {
  const m = spec.match(/^([A-Z.]+):(\d{4}-\d{2}-\d{2}):(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)([CP])$/i);
  if (!m) throw new Error("spread format: TICKER:YYYY-MM-DD:LONG/SHORT{C|P}");
  const [, tk, exp, lk, sk, t] = m;
  const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${tk!.toUpperCase().replace(".", "-")}.json`, {
    headers: { "user-agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`CBOE ${res.status}`);
  const j = await res.json();
  const occ = (k: string) => `${tk!.toUpperCase()}${exp!.slice(2, 4)}${exp!.slice(5, 7)}${exp!.slice(8, 10)}${t!.toUpperCase()}${String(Math.round(Number(k) * 1000)).padStart(8, "0")}`;
  const find = (k: string) => (j.data.options as any[]).find((o) => o.option === occ(k));
  const L = find(lk!);
  const S = find(sk!);
  if (!L || !S) throw new Error(`no ${t!.toUpperCase()} contracts at ${lk}/${sk} expiring ${exp}`);
  const mid = (o: any) => (o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : o.last_trade_price);
  const debit = r2(mid(L) - mid(S));
  const leg = (o: any) => ({ contract: o.option, bid: o.bid, ask: o.ask, mid: r2(mid(o)), iv_pct: r2(o.iv * 100), delta: r2(o.delta) });
  return {
    spread: {
      expiry: exp,
      type: t!.toUpperCase() === "C" ? "call" : "put",
      long: leg(L),
      short: leg(S),
      debit,
      cost_per_contract: r2(debit * 100),
      breakeven: t!.toUpperCase() === "C" ? r2(Number(lk) + debit) : r2(Number(lk) - debit),
      underlying: r2(j.data.current_price),
      as_of: j.timestamp,
      delayed: "about 15 minutes",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!(await allowed(req))) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  try {
    const spread = url.searchParams.get("spread");
    if (spread) return json(await spreadQuote(spread));
    const option = url.searchParams.get("option");
    if (option) return json(await singleQuote(option));
    const symbols = (url.searchParams.get("symbols") ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z^][A-Z0-9.\-=^]{0,11}$/.test(s))
      .slice(0, 25);
    if (!symbols.length) return json({ error: "use ?symbols=NVDA,AAPL or ?spread=NVDA:2026-10-30:220/230C" }, 400);
    return json({ quotes: await Promise.all(symbols.map(stockQuote)) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
