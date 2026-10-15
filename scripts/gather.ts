// The research pack: runs every data script in parallel, saves each result, and prints one digest.
//   node scripts/gather.ts [--out /tmp/md] [IDEA_TICKERS...]
// Needs /tmp/context.json (from agent-context.ts) and the DESK_CONTACT_EMAIL / FRED_API_KEY exports.
// Writes <out>/{quotes,news,econ,calendar,filings,finnhub}.json and <out>/digest.md, and prints the
// digest. Read the digest first; open a JSON file only to dig into something.
// Why: in an early evening run the agent skipped several scripts and then reported data as
// "unavailable" that was in fact one command away. One command, every source, every time.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1]! : "/tmp/md";
const ctxIdx = args.indexOf("--context");
const ctxPath = ctxIdx >= 0 ? args[ctxIdx + 1]! : "/tmp/context.json";
const extra = args.filter((a, i) => !a.startsWith("--") && i !== outIdx + 1 && i !== ctxIdx + 1).map((a) => a.toUpperCase());
if (!existsSync(ctxPath)) {
  console.error("Run `node scripts/agent-context.ts > /tmp/context.json` first.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const ctx = JSON.parse(readFileSync(ctxPath, "utf8"));
const holdings: string[] = (ctx.holdings ?? []).map((h: { ticker: string }) => h.ticker);
const openTickers: string[] = (ctx.open_trades ?? []).map((t: { ticker: string }) => t.ticker);
const ideaTickers = [...new Set([...extra, ...openTickers])];
const MARKET = ["^GSPC", "^IXIC", "^DJI", "^RUT", "^VIX", "^TNX", "DX-Y.NYB", "ES=F", "NQ=F", "CL=F", "GC=F", "BTC-USD", "XLK", "XLE", "XLF", "XLV", "XLY", "XLP", "XLI", "XLU", "SMH"];

function run(name: string, script: string, scriptArgs: string[], timeoutMs: number): Promise<{ name: string; ok: boolean; data: any; err: string }> {
  return new Promise((resolve) => {
    execFile("node", [join("scripts", script), ...scriptArgs], { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
      let data: any = null;
      try {
        data = JSON.parse(stdout);
      } catch {
        /* not JSON */
      }
      writeFileSync(join(out, `${name}.json`), stdout || "null");
      resolve({ name, ok: data != null && !error, data, err: (error ? (error.killed ? "timed out" : error.message) : "") + (stderr ? ` ${stderr}` : "") });
    });
  });
}

const results = await Promise.all([
  run("quotes", "quotes.ts", ["--holdings", ctxPath, ...MARKET, ...ideaTickers], 120_000),
  run("news", "news.ts", ["--market", "--holdings", ctxPath, ...ideaTickers], 150_000),
  run("econ", "econ.ts", [], 90_000),
  run("calendar", "calendar.ts", [], 90_000),
  run("filings", "filings.ts", ["--holdings", ctxPath, ...ideaTickers], 120_000),
  run("finnhub", "finnhub.ts", ["--holdings", ctxPath, ...ideaTickers], 150_000),
]);
const by = Object.fromEntries(results.map((r) => [r.name, r]));

const lines: string[] = [];
const pct = (n: number | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);
lines.push(`# Research pack (${new Date().toISOString()})`, "");
lines.push("## Source status");
for (const r of results) lines.push(`- ${r.name}: ${r.ok ? "OK" : "FAILED"}${r.err.trim() ? ` (${r.err.trim().slice(0, 160)})` : ""}`);
const srcErrors = results.flatMap((r) => (r.data?.errors ?? []).map((e: string) => `${r.name}: ${e}`));
if (srcErrors.length) lines.push("- partial errors: " + srcErrors.slice(0, 8).join(" | "));

// Market
const quotes: any[] = Array.isArray(by.quotes!.data) ? by.quotes!.data : [];
const q = new Map(quotes.map((x) => [x.ticker, x]));
lines.push("", "## Market (latest price, day %, 5-day %)");
for (const t of MARKET) {
  const x = q.get(t);
  if (x && !x.error) lines.push(`- ${t}: ${x.price} (${x.as_of} ${x.session}) day ${pct(x.day_pct)} week ${pct(x.week_pct)}${x.ext_price != null ? ` | ext ${x.ext_price} ${pct(x.ext_pct)} at ${x.ext_time}` : ""}`);
}

// Economy: releases this week with actual vs forecast, then key levels
const cal = by.calendar!.data;
if (cal?.economic?.length) {
  lines.push("", "## Economic releases this week (ET): actual vs forecast");
  for (const e of cal.economic.filter((e: any) => e.impact !== "Low")) {
    lines.push(`- ${e.when} ${e.event} [${e.impact}]: forecast ${e.forecast ?? "—"}, previous ${e.previous ?? "—"}, ${e.released ? `ACTUAL ${e.actual ?? "not yet in data (check news)"}` : "upcoming"}`);
  }
}
const econ = by.econ!.data;
if (econ?.series?.length) {
  lines.push("", `## Economic levels (${econ.source})`);
  for (const s of econ.series) {
    const ch = Object.entries(s)
      .filter(([k]) => /_(pct|change|change_pts)$/.test(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    lines.push(`- ${s.name}: ${s.value} (${s.date}) ${ch}`);
  }
}
if (cal?.earnings?.length) {
  lines.push("", "## Earnings today/tomorrow ($1B+ revenue)");
  lines.push(cal.earnings.slice(0, 30).map((e: any) => `${e.symbol} ${e.date} ${e.when}${e.eps_actual != null ? ` EPS ${e.eps_actual} vs ${e.eps_estimate}` : ""}`).join("; "));
}

// Per ticker: price, news, filings, earnings/analysts
const news = by.news!.data;
const fil = by.filings!.data?.tickers ?? {};
const fh = by.finnhub!.data?.tickers ?? {};
lines.push("", "## Holdings and idea tickers");
for (const t of [...new Set([...holdings, ...ideaTickers])]) {
  const x = q.get(t);
  lines.push("", `### ${t}${holdings.includes(t) ? " (held)" : ""}${openTickers.includes(t) ? " (open paper trade)" : ""}`);
  if (x && !x.error) lines.push(`- price ${x.price} (${x.as_of} ${x.session}) day ${pct(x.day_pct)} week ${pct(x.week_pct)} month ${pct(x.month_pct)}${x.ext_price != null ? ` | ext ${x.ext_price} ${pct(x.ext_pct)} at ${x.ext_time}` : ""}`);
  const f = fh[t];
  if (f?.next_earnings) lines.push(`- next earnings: ${typeof f.next_earnings === "string" ? f.next_earnings : `${f.next_earnings.date} ${f.next_earnings.when} (EPS est ${f.next_earnings.eps_estimate ?? "?"})`}`);
  if (f?.analysts) lines.push(`- analysts ${f.analysts.period}: SB ${f.analysts.strong_buy} B ${f.analysts.buy} H ${f.analysts.hold} S ${f.analysts.sell} SS ${f.analysts.strong_sell}${f.analysts.previous ? ` (prev month B ${f.analysts.previous.buy} H ${f.analysts.previous.hold})` : ""}`);
  const fl = fil[t];
  if (fl?.filings?.length) for (const g of fl.filings.slice(0, 3)) lines.push(`- SEC ${g.form} ${g.date}${g.items ? ` [${g.items.join("; ")}]` : ""} ${g.url}`);
  if (fl?.insider_form4_count) lines.push(`- insider Form 4s (14d): ${fl.insider_form4_count}, latest ${fl.latest_form4}`);
  const items = [...(news?.tickers?.[t] ?? []), ...((f?.news ?? []).map((n: any) => ({ title: n.headline, source: n.source, url: n.url, published: n.date, summary: n.summary })) ?? [])];
  const seen = new Set<string>();
  for (const it of items) {
    const key = String(it.title).toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 5) break;
    lines.push(`- news ${String(it.published ?? "").slice(0, 16)} ${it.source}: ${it.title}${it.summary ? ` — ${String(it.summary).slice(0, 220)}` : ""} (${it.url})`);
  }
}

// Market headlines
if (news?.market?.length) {
  lines.push("", "## Market headlines");
  for (const it of news.market.slice(0, 30)) lines.push(`- ${String(it.published ?? "").slice(0, 16)} ${it.source}: ${it.title}${it.summary ? ` — ${String(it.summary).slice(0, 200)}` : ""} (${it.url})`);
}

const digest = lines.join("\n");
writeFileSync(join(out, "digest.md"), digest);
console.log(digest);
