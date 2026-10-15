// Recent headlines from publisher RSS feeds, for the briefing's research step.
//   node scripts/news.ts --market                              market-wide headlines
//   node scripts/news.ts --holdings /tmp/context.json          per holding ticker
//   node scripts/news.ts NVDA MU --days 3 --max 8              specific tickers
// Feeds: Google News search (surfaces Reuters, AP, Bloomberg, WSJ... headlines and
// snippets), CNBC, Nasdaq, Yahoo Finance, MarketWatch and Federal Reserve RSS.
// Feeds give headlines + summaries, not full articles: several of these sites
// refuse automated page reads, but publish RSS for exactly this use.
// Prints JSON: { market?: Item[], tickers?: { [ticker]: Item[] }, errors: string[] }.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface Item {
  title: string;
  source: string;
  url: string;
  published?: string; // ISO
  summary?: string;
}

const UA = "MarketDesk/1.0 (personal research; RSS reader)";

function get(url: string): string {
  // stderr is captured (not inherited), so curl errors land in `errors`, never mixed into the JSON.
  // Finnhub: in the cloud the egress proxy adds X-Finnhub-Token; locally FINNHUB_TOKEN does.
  const extra = url.includes("finnhub.io") && process.env.FINNHUB_TOKEN ? ["-H", `X-Finnhub-Token: ${process.env.FINNHUB_TOKEN}`] : [];
  return execFileSync("curl", ["-sS", "--fail", "--max-time", "12", "-A", UA, ...extra, url], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Hosts that refused once this run are skipped for the rest of it. In the cloud,
 * Google News sometimes answers every request with 503; retrying each ticker's
 * query cost 2+ minutes in the first evening test.
 */
const deadHosts = new Set<string>();
const hostOf = (url: string) => new URL(url).hostname;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&#x2019;|&#8217;/g, "’")
    .replace(/&#x201[cd];|&#822[01];/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    // Entity-encoded HTML (Google News puts an escaped <a href> list in descriptions): strip it too.
    .replace(/<[^>]*>?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]!) : undefined;
};

export function parseRss(xml: string, fallbackSource: string): Item[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.flatMap((it) => {
    let title = tag(it, "title");
    const url = tag(it, "link") ?? "";
    if (!title || !/^https?:\/\//.test(url)) return [];
    // Google News puts the publisher in <source> and appends " - Publisher" to the title.
    const source = tag(it, "source") ?? fallbackSource;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = tag(it, "pubDate");
    const published = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : undefined;
    let summary = tag(it, "description");
    // Google News "summaries" are just the title plus the source name again: drop those.
    if (summary && (summary === title || summary.startsWith(title) || summary.length < title.length + 25)) summary = undefined;
    if (summary && summary.length > 400) summary = summary.slice(0, 397) + "…";
    return [{ title, source, url, published, ...(summary ? { summary } : {}) }];
  });
}

/** Finnhub company-news JSON → Items. */
function parseFinnhub(body: string): Item[] {
  const arr = JSON.parse(body) as { headline?: string; source?: string; url?: string; datetime?: number; summary?: string }[];
  return arr
    .filter((n) => n.headline && n.url && /^https?:\/\//.test(n.url))
    .map((n) => ({
      title: decode(n.headline!),
      source: n.source ? `${n.source} (via Finnhub)` : "Finnhub",
      url: n.url!,
      ...(n.datetime ? { published: new Date(n.datetime * 1000).toISOString() } : {}),
      ...(n.summary ? { summary: decode(n.summary).slice(0, 400) } : {}),
    }));
}

const gnews = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const MARKET_FEEDS: [string, string][] = [
  ["Reuters (via Google News)", gnews("site:reuters.com (markets OR stocks OR economy OR Fed) when:1d")],
  ["Markets (via Google News)", gnews("stock market today when:1d")],
  ["CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"],
  ["CNBC Markets", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069"],
  ["CNBC Earnings", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135"],
  ["Nasdaq", "https://www.nasdaq.com/feed/rssoutbound?category=Markets"],
  ["MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
  ["Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml"],
];

const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const tickerFeeds = (t: string, name?: string): [string, string][] => [
  // Finnhub company news first: it carries Benzinga-style "why is X moving" items, and doesn't
  // block the cloud machines the way Google News sometimes does.
  ["Finnhub", `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(t)}&from=${ymd(-3)}&to=${ymd(0)}`],
  ["Google News", gnews(`${name ? `"${coreName(name)}"` : `"${t}"`} (stock OR shares OR earnings OR analyst OR guidance) when:3d`)],
  ["Yahoo Finance", `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(t)}&region=US&lang=en-US`],
  ["Nasdaq", `https://www.nasdaq.com/feed/rssoutbound?symbol=${encodeURIComponent(t)}`],
];

/** "PENN Entertainment, Inc." → "PENN Entertainment"; "Space Exploration Technologies (SpaceX) Cl A" → "Space Exploration Technologies". */
function coreName(name: string): string {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(inc|corp|corporation|co|company|plc|ltd|holdings|group|class [a-z]|cl [a-z]|pbc|com|new)\b\.?/gi, " ")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep an item only if it's about this ticker: the ticker as an upper-case word
 * (so "PENN" matches, "Penn State" doesn't) or the company's core name, or a
 * nickname given in parentheses, e.g. "(SpaceX)".
 */
function relevant(it: Item, t: string, name?: string): boolean {
  const text = `${it.title} ${it.summary ?? ""}`;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[^A-Za-z])\\$?${esc(t)}([^A-Za-z]|$)`).test(text)) return true;
  if (!name) return false;
  const keys = [coreName(name), ...[...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!)].filter((k) => k.length >= 4);
  return keys.some((k) => text.toLowerCase().includes(k.toLowerCase()));
}

function collect(feeds: [string, string][], days: number, max: number, errors: string[], keep?: (it: Item) => boolean): Item[] {
  const cutoff = Date.now() - days * 86_400_000;
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const [label, url] of feeds) {
    const host = hostOf(url);
    if (deadHosts.has(host)) continue;
    let items: Item[];
    try {
      const body = get(url);
      items = url.includes("finnhub.io") ? parseFinnhub(body) : parseRss(body, label);
    } catch (e) {
      const msg = String((e as { stderr?: string }).stderr || (e as Error).message).trim();
      // A refusal (401/403/429/503) or timeout means the host is blocking this run: stop asking it.
      if (/\b(401|403|429|503)\b|timed out|Could not resolve/i.test(msg)) {
        deadHosts.add(host);
        errors.push(`${label} (${host}): ${msg.slice(0, 100)} (skipping this host for the rest of the run)`);
      } else errors.push(`${label}: ${msg.slice(0, 120)}`);
      continue;
    }
    for (const it of items) {
      if (it.published && Date.parse(it.published) < cutoff) continue;
      if (keep && !keep(it)) continue;
      // Quote/chart pages for individual option contracts are not news.
      if (/\b[A-Z]{1,6}\d{6}[CP]\d{8}\b|Interactive Stock Chart|Stock Price, News, Quote & History/.test(it.title)) continue;
      const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }
  out.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  return out.slice(0, max);
}

const isMain = process.argv[1] && /news\.ts$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const args = process.argv.slice(2);
  let days = 2;
  let max = 0;
  let market = false;
  const tickers: { t: string; name?: string }[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--market") market = true;
    else if (a === "--days") days = Number(args[++i]);
    else if (a === "--max") max = Number(args[++i]);
    else if (a === "--holdings") {
      const ctx = JSON.parse(readFileSync(args[++i]!, "utf8"));
      for (const h of ctx.holdings ?? []) tickers.push({ t: h.ticker, name: h.name ?? undefined });
    } else tickers.push({ t: a.toUpperCase() });
  }
  if (!market && !tickers.length) {
    console.error("usage: node scripts/news.ts [--market] [--holdings /tmp/context.json] [TICKER ...] [--days 2] [--max N]");
    process.exitCode = 2;
  } else {
    const errors: string[] = [];
    const result: { market?: Item[]; tickers?: Record<string, Item[]>; errors: string[] } = { errors };
    if (market) result.market = collect(MARKET_FEEDS, Math.max(days, 1), max || 40, errors);
    if (tickers.length) {
      result.tickers = {};
      for (const { t, name } of tickers) result.tickers[t] = collect(tickerFeeds(t, name), Math.max(days, 3), max || 8, errors, (it) => relevant(it, t, name));
    }
    console.log(JSON.stringify(result, null, 1));
  }
}
