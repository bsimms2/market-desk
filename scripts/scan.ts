// Market scan for the aggressive paper bot: Yahoo's predefined screeners plus sector ETFs.
//   node scripts/scan.ts                         movers + actives + growth/value lists, and sectors
//   node scripts/scan.ts day_gainers most_shorted_stocks --count 25 --all
// Lists: day_gainers, day_losers, most_actives, small_cap_gainers, growth_technology_stocks,
// undervalued_growth_stocks, undervalued_large_caps, aggressive_small_caps, most_shorted_stocks.
// By default keeps stocks over $5 with a $2B+ market cap (liquid enough for options); --all keeps everything.
// Prints JSON: { lists: { name: [row] }, sectors: [row], errors: [] }. Each row has the day %, relative
// volume (today vs. the 3-month average), distance from the 50/200-day averages and the 52-week high,
// forward P/E, analyst rating and the next earnings date (New York). No key needed (curl, like quotes.ts).
import { execFileSync } from "node:child_process";

const DEFAULT_LISTS = ["day_gainers", "day_losers", "most_actives", "growth_technology_stocks", "undervalued_large_caps"];
const SECTORS: Record<string, string> = {
  XLK: "Technology",
  SMH: "Semiconductors",
  XLC: "Communication",
  XLY: "Consumer discretionary",
  XLP: "Consumer staples",
  XLF: "Financials",
  XLV: "Health care",
  XLI: "Industrials",
  XLE: "Energy",
  XLB: "Materials",
  XLU: "Utilities",
  XLRE: "Real estate",
  IWM: "Small caps (Russell 2000)",
};

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const count = Number(opt("--count") ?? 15);
const all = args.includes("--all");
const lists = args.filter((a) => !a.startsWith("--"));

function get(url: string): any {
  const raw = execFileSync("curl", ["-sSL", "--fail", "--max-time", "25", "-A", "Mozilla/5.0 MarketDesk", url], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(raw);
}

const r1 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined);
const nyDate = (sec: unknown) => (typeof sec === "number" ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(sec * 1000)) : undefined);

function row(q: any) {
  return {
    symbol: q.symbol,
    name: q.shortName ?? q.longName,
    price: q.regularMarketPrice,
    day_pct: r1(q.regularMarketChangePercent),
    rel_volume: q.averageDailyVolume3Month ? r1(q.regularMarketVolume / q.averageDailyVolume3Month) : undefined,
    market_cap_b: q.marketCap ? r1(q.marketCap / 1e9) : undefined,
    vs_50d_pct: r1((q.fiftyDayAverageChangePercent ?? NaN) * 100),
    vs_200d_pct: r1((q.twoHundredDayAverageChangePercent ?? NaN) * 100),
    from_52w_high_pct: r1((q.fiftyTwoWeekHighChangePercent ?? NaN) * 100),
    forward_pe: r1(q.forwardPE),
    analyst_rating: q.averageAnalystRating,
    next_earnings: nyDate(q.earningsTimestampStart ?? q.earningsTimestamp),
    earnings_estimated: q.isEarningsDateEstimate,
  };
}

const out: { lists: Record<string, unknown[]>; sectors: unknown[]; errors: string[] } = { lists: {}, sectors: [], errors: [] };

for (const id of lists.length ? lists : DEFAULT_LISTS) {
  try {
    const j = get(`https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${encodeURIComponent(id)}&count=${Math.min(100, count * 3)}`);
    const quotes = (j?.finance?.result?.[0]?.quotes ?? []) as any[];
    out.lists[id] = quotes
      .filter((q) => all || ((q.regularMarketPrice ?? 0) >= 5 && (q.marketCap ?? 0) >= 2e9))
      .slice(0, count)
      .map(row);
  } catch (e) {
    out.errors.push(`${id}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}

try {
  const syms = Object.keys(SECTORS).join(",");
  const j = get(`https://query2.finance.yahoo.com/v7/finance/spark?symbols=${syms}&range=1mo&interval=1d`);
  for (const r of (j?.spark?.result ?? []) as any[]) {
    const closes: number[] = (r.response?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((x: unknown) => typeof x === "number");
    const last = closes.at(-1);
    const pct = (back: number) => (last != null && closes.length > back ? r1(((last - closes[closes.length - 1 - back]!) / closes[closes.length - 1 - back]!) * 100) : undefined);
    out.sectors.push({ symbol: r.symbol, sector: SECTORS[r.symbol], price: last, day_pct: pct(1), week_pct: pct(5), month_pct: last != null && closes.length ? r1(((last - closes[0]!) / closes[0]!) * 100) : undefined });
  }
  out.sectors.sort((a: any, b: any) => (b.week_pct ?? -99) - (a.week_pct ?? -99));
} catch (e) {
  out.errors.push(`sectors: ${e instanceof Error ? e.message.split("\n")[0] : String(e)} (use quotes.ts on the sector ETFs instead)`);
}

console.log(JSON.stringify(out, null, 1));
