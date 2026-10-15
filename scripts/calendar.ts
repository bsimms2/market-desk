// This week's US economic releases (with consensus forecasts) and today's/tomorrow's earnings.
//   node scripts/calendar.ts [--days 2]
// Economic: the Forex Factory weekly calendar feed (time, impact, forecast, previous, actual).
// Earnings: Finnhub's market-wide earnings calendar (needs the Finnhub network secret, or
// FINNHUB_TOKEN locally); trimmed to companies with revenue estimates of $1B+ so it stays readable.
// Prints JSON: { economic: [...], earnings: [...], errors: [...] }. Times are New York time.
import { execFileSync } from "node:child_process";

function curl(url: string, headers: string[] = []): string {
  return execFileSync("curl", ["-sSL", "--fail", "--max-time", "25", "-A", "Mozilla/5.0 MarketDesk", ...headers.flatMap((h) => ["-H", h]), url], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const nyDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const nyTime = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

const args = process.argv.slice(2);
const days = args.includes("--days") ? Number(args[args.indexOf("--days") + 1]) : 2;
const errors: string[] = [];
const today = nyDate(new Date());
const until = nyDate(new Date(Date.now() + days * 86_400_000));

// Actuals: the calendar feed only has forecasts, so for releases that are already out we read the
// number from FRED (same-day republication of BLS/Census/BEA data). Event title → FRED series + measure.
type Measure = "mom" | "yoy" | "level_k" | "level" | "change_k";
const ACTUALS: { re: RegExp; series: string; measure: Measure; freq: "m" | "w" }[] = [
  { re: /^Core CPI m\/m/i, series: "CPILFESL", measure: "mom", freq: "m" },
  { re: /^Core CPI y\/y/i, series: "CPILFESL", measure: "yoy", freq: "m" },
  { re: /^CPI m\/m/i, series: "CPIAUCSL", measure: "mom", freq: "m" },
  { re: /^CPI y\/y/i, series: "CPIAUCSL", measure: "yoy", freq: "m" },
  { re: /^PPI m\/m/i, series: "PPIFIS", measure: "mom", freq: "m" },
  { re: /^Core Retail Sales m\/m/i, series: "RSFSXMV", measure: "mom", freq: "m" },
  { re: /^Retail Sales m\/m/i, series: "RSAFS", measure: "mom", freq: "m" },
  { re: /^Unemployment Claims/i, series: "ICSA", measure: "level_k", freq: "w" },
  { re: /^Unemployment Rate/i, series: "UNRATE", measure: "level", freq: "m" },
  { re: /^Non-Farm Employment Change/i, series: "PAYEMS", measure: "change_k", freq: "m" },
  { re: /^Average Hourly Earnings m\/m/i, series: "CES0500000003", measure: "mom", freq: "m" },
  { re: /^Core PCE Price Index m\/m/i, series: "PCEPILFE", measure: "mom", freq: "m" },
  { re: /^Industrial Production m\/m/i, series: "INDPRO", measure: "mom", freq: "m" },
];

const fredCache = new Map<string, { date: string; value: number }[]>();
function fredObs(series: string): { date: string; value: number }[] {
  if (!fredCache.has(series)) {
    const j = JSON.parse(
      curl(`https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${process.env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=20`),
    );
    fredCache.set(series, (j.observations ?? []).filter((o: { value: string }) => o.value !== ".").map((o: { date: string; value: string }) => ({ date: o.date, value: Number(o.value) })));
  }
  return fredCache.get(series)!;
}

/** The released number for an event, if FRED already has the period it covers. */
function actualFor(title: string, eventDate: string): { actual: string; period: string } | undefined {
  const m = ACTUALS.find((a) => a.re.test(title));
  if (!m || !process.env.FRED_API_KEY) return undefined;
  const obs = fredObs(m.series);
  const [cur] = obs;
  if (!cur) return undefined;
  if (m.freq === "m") {
    // A monthly release covers the previous month (or the one before, for PCE).
    const ev = new Date(eventDate + "T00:00:00Z");
    const minus = (n: number) => new Date(Date.UTC(ev.getUTCFullYear(), ev.getUTCMonth() - n, 1)).toISOString().slice(0, 10);
    if (cur.date !== minus(1) && cur.date !== minus(2)) return undefined;
  } else if ((Date.parse(eventDate) - Date.parse(cur.date)) / 86_400_000 > 9) return undefined;
  const ym = (d: string, months: number) => {
    const t = new Date(d + "T00:00:00Z");
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - months, 1)).toISOString().slice(0, 10);
  };
  const at = (d: string) => obs.find((o) => o.date === d)?.value;
  const fmtPct = (n: number) => `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(1)}%`;
  let actual: string | undefined;
  if (m.measure === "mom") {
    const prev = m.freq === "m" ? at(ym(cur.date, 1)) : obs[1]?.value;
    if (prev) actual = fmtPct(((cur.value - prev) / prev) * 100);
  } else if (m.measure === "yoy") {
    const ago = at(ym(cur.date, 12));
    if (ago) actual = fmtPct(((cur.value - ago) / ago) * 100);
  } else if (m.measure === "level_k") actual = `${Math.round(cur.value / 1000)}K`;
  else if (m.measure === "level") actual = `${cur.value.toFixed(1)}%`;
  else if (m.measure === "change_k") {
    const prev = at(ym(cur.date, 1));
    if (prev != null) actual = `${Math.round(cur.value - prev)}K`;
  }
  return actual ? { actual, period: cur.date } : undefined;
}

let economic: unknown[] = [];
try {
  const all = JSON.parse(curl("https://nfs.faireconomy.media/ff_calendar_thisweek.json")) as {
    title: string;
    country: string;
    date: string;
    impact: string;
    forecast?: string;
    previous?: string;
    actual?: string;
  }[];
  const nowMs = Date.now();
  economic = all
    .filter((e) => e.country === "USD" && e.impact !== "Holiday")
    .map((e) => {
      const released = Date.parse(e.date) <= nowMs;
      let fred: { actual: string; period: string } | undefined;
      if (released) {
        try {
          fred = actualFor(e.title, nyDate(new Date(e.date)));
        } catch (err) {
          errors.push(`FRED actual for ${e.title}: ${(err as Error).message.slice(0, 80)}`);
        }
      }
      return {
        when: nyTime(new Date(e.date)),
        date: nyDate(new Date(e.date)),
        event: e.title,
        impact: e.impact,
        forecast: e.forecast || undefined,
        previous: e.previous || undefined,
        released,
        actual: e.actual || fred?.actual || undefined,
        ...(fred ? { actual_source: `FRED (period ${fred.period}; computed from SA data, may differ by 0.1 from the headline)` } : {}),
      };
    });
} catch (e) {
  errors.push(`economic calendar: ${String((e as { stderr?: string }).stderr || (e as Error).message).trim().slice(0, 120)}`);
}

let earnings: unknown[] = [];
try {
  const headers = process.env.FINNHUB_TOKEN ? [`X-Finnhub-Token: ${process.env.FINNHUB_TOKEN}`] : [];
  const j = JSON.parse(curl(`https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${until}`, headers));
  earnings = (j.earningsCalendar ?? [])
    .filter((e: { revenueEstimate?: number }) => (e.revenueEstimate ?? 0) >= 1e9)
    .sort((a: { date: string; revenueEstimate: number }, b: { date: string; revenueEstimate: number }) => a.date.localeCompare(b.date) || b.revenueEstimate - a.revenueEstimate)
    .slice(0, 60)
    .map((e: { symbol: string; date: string; hour: string; epsEstimate?: number; revenueEstimate?: number; epsActual?: number; revenueActual?: number }) => ({
      symbol: e.symbol,
      date: e.date,
      when: e.hour === "bmo" ? "before open" : e.hour === "amc" ? "after close" : e.hour || "unspecified",
      eps_estimate: e.epsEstimate ?? undefined,
      revenue_estimate_b: e.revenueEstimate ? Math.round(e.revenueEstimate / 1e7) / 100 : undefined,
      eps_actual: e.epsActual ?? undefined,
    }));
} catch (e) {
  errors.push(`earnings calendar: ${String((e as { stderr?: string }).stderr || (e as Error).message).trim().slice(0, 120)}`);
}

console.log(JSON.stringify({ today, economic, earnings, errors }, null, 1));
