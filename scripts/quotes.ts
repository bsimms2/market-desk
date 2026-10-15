// Verified prices for the briefing, from Yahoo Finance's chart feed (no key).
//   node scripts/quotes.ts AAPL NVDA SPY ^VIX ^TNX CL=F
//   node scripts/quotes.ts --holdings /tmp/context.json   (every holding ticker)
//   node scripts/quotes.ts --holdings /tmp/context.json SPY QQQ ^TNX
// Prints JSON: one entry per ticker with the latest price and its New York date,
// the previous close, day %, 5-day % and 1-month % changes, and the last 6 daily closes.
// Use `price`/`as_of` for the payload's `prices`. Errors are per ticker; check `error`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface Quote {
  ticker: string;
  name?: string;
  price?: number;
  as_of?: string; // New York date of `price`
  session?: "pre" | "regular" | "post" | "closed";
  prev_close?: number;
  day_pct?: number;
  week_pct?: number; // vs. the close 5 trading days before the latest
  month_pct?: number; // vs. the first close in the 1-month window
  closes?: { date: string; close: number }[];
  /** Pre-market or after-hours trade, when the regular session is closed. */
  ext_price?: number;
  ext_time?: string; // New York time, e.g. "08:23"
  ext_pct?: number; // vs. `price` (the last regular-session close)
  error?: string;
}

const nyDate = (unixSec: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(unixSec * 1000));
const pct = (a: number, b: number) => Math.round(((a - b) / b) * 10000) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;

function fetchChart(ticker: string, query = "range=1mo&interval=1d"): any {
  let last = "";
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const out = execFileSync(
        "curl",
        ["-sS", "--max-time", "20", "-A", "Mozilla/5.0", `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?${query}`],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      );
      const j = JSON.parse(out);
      if (j?.chart?.result?.[0]) return j.chart.result[0];
      last = j?.chart?.error?.description ?? "no data";
    } catch (e) {
      last = (e as { stderr?: string; message: string }).stderr?.trim() || (e as Error).message;
    }
  }
  throw new Error(last);
}

/** Latest pre-market/after-hours trade from 5-minute bars (Yahoo includes them on request). */
function extended(ticker: string, regular: number | undefined): Partial<Quote> {
  try {
    const r = fetchChart(ticker, "range=1d&interval=5m&includePrePost=true");
    const ts: number[] = r.timestamp ?? [];
    const c: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    let i = c.length - 1;
    while (i >= 0 && typeof c[i] !== "number") i--;
    if (i < 0) return {};
    const px = r2(c[i]!);
    const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ts[i]! * 1000));
    // Futures/indexes trade "around the clock" and have no separate extended price.
    if (regular == null || px === regular) return {};
    return { ext_price: px, ext_time: time, ext_pct: pct(px, regular) };
  } catch {
    return {};
  }
}

export function quote(ticker: string): Quote {
  try {
    const r = fetchChart(ticker);
    const m = r.meta ?? {};
    const ts: number[] = r.timestamp ?? [];
    const raw: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    const closes = ts
      .map((t, i) => ({ date: nyDate(t), close: raw[i] }))
      .filter((x): x is { date: string; close: number } => typeof x.close === "number")
      .map((x) => ({ date: x.date, close: r2(x.close) }));
    const price = typeof m.regularMarketPrice === "number" ? r2(m.regularMarketPrice) : closes.at(-1)?.close;
    const asOf = m.regularMarketTime ? nyDate(m.regularMarketTime) : closes.at(-1)?.date;
    const now = Date.now() / 1000;
    const p = m.currentTradingPeriod ?? {};
    const session: Quote["session"] =
      p.regular && now >= p.regular.start && now < p.regular.end
        ? "regular"
        : p.pre && now >= p.pre.start && now < p.pre.end
          ? "pre"
          : p.post && now >= p.post.start && now < p.post.end
            ? "post"
            : "closed";
    // Previous close = the last daily close dated before `as_of`.
    const before = closes.filter((c) => asOf && c.date < asOf);
    const prev = before.at(-1)?.close;
    const latestIdx = closes.length - 1;
    const weekBase = closes[latestIdx - 5]?.close;
    const monthBase = closes[0]?.close;
    return {
      ticker,
      name: m.longName ?? m.shortName,
      price,
      as_of: asOf,
      session,
      prev_close: prev,
      day_pct: price != null && prev ? pct(price, prev) : undefined,
      week_pct: price != null && weekBase ? pct(price, weekBase) : undefined,
      month_pct: price != null && monthBase ? pct(price, monthBase) : undefined,
      closes: closes.slice(-6),
      ...(session === "pre" || session === "post" ? extended(ticker, price) : {}),
    };
  } catch (e) {
    return { ticker, error: (e as Error).message.slice(0, 200) };
  }
}

const isMain = process.argv[1] && /quotes\.ts$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const args = process.argv.slice(2);
  const tickers: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--holdings") {
      const ctx = JSON.parse(readFileSync(args[++i]!, "utf8"));
      for (const h of ctx.holdings ?? []) tickers.push(h.ticker);
    } else tickers.push(args[i]!);
  }
  if (!tickers.length) {
    console.error("usage: node scripts/quotes.ts [--holdings /tmp/context.json] TICKER ...");
    process.exitCode = 2;
  } else {
    const out = [...new Set(tickers)].map(quote);
    console.log(JSON.stringify(out, null, 1));
    if (out.every((q) => q.error)) process.exitCode = 1;
  }
}
