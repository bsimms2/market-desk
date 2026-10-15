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
  economic = all
    .filter((e) => e.country === "USD" && e.impact !== "Holiday")
    .map((e) => ({
      when: nyTime(new Date(e.date)),
      date: nyDate(new Date(e.date)),
      event: e.title,
      impact: e.impact,
      forecast: e.forecast || undefined,
      previous: e.previous || undefined,
      actual: e.actual || undefined,
    }));
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
