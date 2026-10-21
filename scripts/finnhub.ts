// Earnings dates, analyst ratings and company news from Finnhub (free tier).
//   node scripts/finnhub.ts --holdings /tmp/context.json [TICKERS] [--days 45]
// Auth: in the cloud environment, a network secret adds the X-Finnhub-Token header
// for finnhub.io on the way out (the session never sees the key). Locally, set
// FINNHUB_TOKEN in .env. Like desk-env.ts, requests go through curl so the
// proxy-injected header applies.
// Prints JSON per ticker: next earnings (date, before/after market, EPS and revenue
// estimates), the latest analyst recommendation counts and their trend, and the
// company's news headlines from the last 3 days. Endpoints the free tier refuses
// are reported in `errors` instead of failing the run.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "https://finnhub.io/api/v1";

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The free tier allows 60 calls a minute. Space calls out, and back off and retry on 429,
// so a full holdings run (3 calls per ticker) finishes instead of failing halfway.
const GAP_MS = 1100;
let lastCall = 0;

function get(path: string): any {
  const args = ["-sS", "--max-time", "20", "-w", "\n%{http_code}"];
  if (process.env.FINNHUB_TOKEN) args.push("-H", `X-Finnhub-Token: ${process.env.FINNHUB_TOKEN}`);
  args.push(BASE + path);
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) sleep(wait);
    lastCall = Date.now();
    const out = execFileSync("curl", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const cut = out.lastIndexOf("\n");
    const status = Number(out.slice(cut + 1));
    const body = out.slice(0, cut);
    if (status === 429 && attempt < 3) {
      sleep(5000 * (attempt + 1));
      continue;
    }
    if (status !== 200) throw new Error(`HTTP ${status}: ${body.slice(0, 120)}`);
    return JSON.parse(body);
  }
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const isMain = process.argv[1] && /finnhub\.ts$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const args = process.argv.slice(2);
  let days = 45;
  const tickers: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days") days = Number(args[++i]);
    else if (args[i] === "--holdings") tickers.push(...(JSON.parse(readFileSync(args[++i]!, "utf8")).holdings ?? []).map((h: { ticker: string }) => h.ticker));
    else tickers.push(args[i]!.toUpperCase());
  }
  if (!tickers.length) {
    console.error("usage: node scripts/finnhub.ts [--holdings /tmp/context.json] [TICKER ...] [--days 45]");
    process.exit(2);
  }
  const errors: string[] = [];
  const out: Record<string, unknown> = {};
  for (const t of [...new Set(tickers)]) {
    const row: Record<string, unknown> = {};
    try {
      const cal = get(`/calendar/earnings?from=${day(-1)}&to=${day(days)}&symbol=${encodeURIComponent(t)}`);
      const next = (cal.earningsCalendar ?? []).sort((a: any, b: any) => a.date.localeCompare(b.date))[0];
      row.next_earnings = next
        ? {
            date: next.date,
            when: next.hour === "bmo" ? "before market open" : next.hour === "amc" ? "after market close" : next.hour || "unspecified",
            quarter: `Q${next.quarter} ${next.year}`,
            eps_estimate: next.epsEstimate ?? undefined,
            revenue_estimate: next.revenueEstimate ?? undefined,
          }
        : `none in the next ${days} days`;
    } catch (e) {
      errors.push(`${t} earnings: ${(e as Error).message}`);
    }
    try {
      const rec: any[] = get(`/stock/recommendation?symbol=${encodeURIComponent(t)}`);
      const [cur, prev] = rec;
      if (cur) {
        const sum = (x: any) => ({ strong_buy: x.strongBuy, buy: x.buy, hold: x.hold, sell: x.sell, strong_sell: x.strongSell });
        row.analysts = { period: cur.period, ...sum(cur), ...(prev ? { previous: { period: prev.period, ...sum(prev) } } : {}) };
      }
    } catch (e) {
      errors.push(`${t} recommendations: ${(e as Error).message}`);
    }
    try {
      const news: any[] = get(`/company-news?symbol=${encodeURIComponent(t)}&from=${day(-3)}&to=${day(0)}`);
      row.news = news.slice(0, 6).map((n) => ({
        date: new Date(n.datetime * 1000).toISOString().slice(0, 16).replace("T", " "),
        source: n.source,
        headline: n.headline,
        summary: n.summary ? String(n.summary).slice(0, 300) : undefined,
        url: n.url,
      }));
    } catch (e) {
      errors.push(`${t} news: ${(e as Error).message}`);
    }
    out[t] = row;
  }
  console.log(JSON.stringify({ tickers: out, errors }, null, 1));
  if (Object.values(out).every((r) => Object.keys(r as object).length === 0)) process.exitCode = 1;
}
