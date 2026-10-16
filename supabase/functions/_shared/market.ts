// Market data shared by the edge functions: Yahoo's chart feed for stocks, CBOE's delayed
// (~15 min) option chains. No keys involved. Read-only.

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const nyDate = (sec: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(sec * 1000));
export const nyTime = (sec: number) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(sec * 1000));

export async function chart(symbol: string, query: string): Promise<any> {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (res.ok) {
      const j = await res.json();
      if (j?.chart?.result?.[0]) return j.chart.result[0];
    }
  }
  throw new Error(`no quote for ${symbol}`);
}

export async function stockQuote(symbol: string) {
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

export async function cboeChain(ticker: string) {
  const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${ticker.toUpperCase().replace(".", "-")}.json`, {
    headers: { "user-agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`CBOE ${res.status}`);
  return await res.json();
}

export const occOf = (tk: string, exp: string, t: string, k: string) =>
  `${tk.toUpperCase()}${exp.slice(2, 4)}${exp.slice(5, 7)}${exp.slice(8, 10)}${t.toUpperCase()}${String(Math.round(Number(k) * 1000)).padStart(8, "0")}`;
/** The listed expiry closest to `want`, if within 3 days (ideas sometimes say "Nov 21" for the Friday Nov 20 expiry). */
export function snapExpiry(options: any[], tk: string, want: string): string {
  const listed = [...new Set(options.map((o: any) => String(o.option).slice(tk.length, tk.length + 6)))].map((d) => `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`);
  const t = Date.parse(want);
  let best = want;
  let bestGap = Infinity;
  for (const d of listed) {
    const gap = Math.abs(Date.parse(d) - t) / 86_400_000;
    if (gap < bestGap) [best, bestGap] = [d, gap];
  }
  return bestGap <= 3 ? best : want;
}

export const midOf = (o: any) => (o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : o.last_trade_price);
