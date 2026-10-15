// Real option prices from CBOE's delayed (~15 min) chain: no key, every strike, IV and greeks.
//   node scripts/options.ts NVDA                                  summary: price, IV30, expiries, ATM implied moves
//   node scripts/options.ts NVDA --expiry 2026-10-30 --spread 220/230C   price a call debit spread
//   node scripts/options.ts NVDA --expiry 2026-10-30 --spread 210/200P   price a put debit spread
//   node scripts/options.ts NVDA --expiry 2026-10-30 --strikes 210-230   the chain around those strikes
// Use it for every "Options angle": quote real premiums (mid of bid/ask), IV and delta, and
// the implied move (ATM straddle ÷ stock price) into earnings. Prints JSON.
import { execFileSync } from "node:child_process";

interface Opt {
  option: string; // OCC symbol, e.g. NVDA261030C00220000
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  open_interest: number;
  volume: number;
  last_trade_price: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function parse(sym: string) {
  const m = sym.match(/^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return { root: m[1]!, expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] as "C" | "P", strike: Number(m[6]) / 1000 };
}

function load(ticker: string) {
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(ticker.replace(".", "-"))}.json`;
  const raw = execFileSync("curl", ["-sSL", "--fail", "--max-time", "40", "-A", "Mozilla/5.0 MarketDesk", url], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const j = JSON.parse(raw);
  const opts = (j.data.options as Opt[]).map((o) => ({ ...o, ...parse(o.option)! })).filter((o) => o.expiry);
  return { asOf: j.timestamp as string, price: j.data.current_price as number, iv30: j.data.iv30 as number, opts };
}

const mid = (o: { bid: number; ask: number; last_trade_price: number }) => (o.bid > 0 && o.ask > 0 ? r2((o.bid + o.ask) / 2) : o.last_trade_price);
const row = (o: ReturnType<typeof load>["opts"][number]) => ({
  contract: o.option,
  type: o.type === "C" ? "call" : "put",
  strike: o.strike,
  bid: o.bid,
  ask: o.ask,
  mid: mid(o),
  iv_pct: r2(o.iv * 100),
  delta: r2(o.delta),
  theta_per_day: r2(o.theta),
  open_interest: o.open_interest,
});

const args = process.argv.slice(2);
const ticker = (args.find((a) => !a.startsWith("--") && !/^\d/.test(a)) ?? "").toUpperCase();
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
if (!ticker) {
  console.error("usage: node scripts/options.ts TICKER [--expiry YYYY-MM-DD] [--spread 220/230C] [--strikes 210-230]");
  process.exit(2);
}

try {
  const { asOf, price, iv30, opts } = load(ticker);
  // Only expiries that haven't passed yet (New York date).
  const todayNy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const expiries = [...new Set(opts.map((o) => o.expiry))].filter((e) => e >= todayNy).sort();
  const atm = (exp: string) => {
    const strikes = [...new Set(opts.filter((o) => o.expiry === exp).map((o) => o.strike))];
    const k = strikes.reduce((a, b) => (Math.abs(b - price) < Math.abs(a - price) ? b : a), strikes[0]!);
    const c = opts.find((o) => o.expiry === exp && o.strike === k && o.type === "C");
    const p = opts.find((o) => o.expiry === exp && o.strike === k && o.type === "P");
    if (!c || !p) return undefined;
    const straddle = r2(mid(c) + mid(p));
    return { expiry: exp, atm_strike: k, straddle, implied_move_pct: r2((straddle / price) * 100), call_iv_pct: r2(c.iv * 100) };
  };
  const out: Record<string, unknown> = { ticker, as_of: asOf, delayed: "about 15 minutes", underlying: r2(price), iv30_pct: r2(iv30) };
  const exp = opt("--expiry") ?? expiries[0];
  const spread = opt("--spread");
  const strikes = opt("--strikes");
  if (spread && exp) {
    const m = spread.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)([CP])$/i);
    if (!m) throw new Error("spread format: LONG/SHORT then C or P, e.g. 220/230C");
    const [lk, sk, t] = [Number(m[1]), Number(m[2]), m[3]!.toUpperCase()];
    const leg = (k: number) => opts.find((o) => o.expiry === exp && o.strike === k && o.type === t);
    const L = leg(lk);
    const S = leg(sk);
    if (!L || !S) throw new Error(`no ${t} at ${lk} or ${sk} for ${exp}; nearby expiries: ${expiries.slice(0, 8).join(", ")}`);
    const debit = r2(mid(L) - mid(S));
    const width = Math.abs(sk - lk);
    out.spread = {
      expiry: exp,
      long: row(L),
      short: row(S),
      net_debit_per_share: debit,
      cost_per_contract: r2(debit * 100),
      max_profit_per_contract: r2((width - debit) * 100),
      breakeven: t === "C" ? r2(lk + debit) : r2(lk - debit),
      reward_to_risk: debit > 0 ? r2((width - debit) / debit) : undefined,
    };
  } else if (strikes && exp) {
    const [lo, hi] = strikes.split("-").map(Number);
    out.chain = opts.filter((o) => o.expiry === exp && o.strike >= lo! && o.strike <= hi!).sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type)).map(row);
  } else {
    out.expiries = expiries.slice(0, 12);
    out.implied_moves = expiries.slice(0, 6).map(atm).filter(Boolean);
  }
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.log(JSON.stringify({ ticker, error: String((e as { stderr?: string }).stderr || (e as Error).message).trim().slice(0, 200) }));
  process.exitCode = 1;
}
