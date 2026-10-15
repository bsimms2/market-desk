import { parseOptionStructure, todayIso } from "@desk/core";
import { supabase } from "./supabase";

/** What the "Live price" button shows and fills in. */
export interface LivePrice {
  price: number;
  /** One line for under the field, e.g. "NVDA $216.83 pre-market, 9:16 ET". */
  note: string;
}

async function call(query: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke(`quote?${query}`, { method: "GET" });
  if (error) {
    // supabase-js wraps non-2xx responses; surface the function's own message when there is one.
    const ctx = (error as { context?: Response }).context;
    const body = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(body?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const money = (n: number) => "$" + n.toFixed(2);

export async function stockPrice(ticker: string): Promise<LivePrice> {
  const { quotes } = await call(`symbols=${encodeURIComponent(ticker)}`);
  const q = quotes?.[0];
  if (!q || q.error) throw new Error(q?.error ?? "no quote");
  if (q.ext_price != null) {
    const when = q.session === "pre" ? "pre-market" : "after hours";
    return { price: q.ext_price, note: `${q.symbol} ${money(q.ext_price)} ${when}, ${q.ext_time} ET (last close ${money(q.price)})` };
  }
  const when = q.session === "regular" ? "live" : `last close (${q.as_of} ET)`;
  return { price: q.price, note: `${q.symbol} ${money(q.price)} ${when}` };
}

/**
 * Premium for an option idea, from its structure text. Returns null when the structure
 * can't be read (then the user types the premium themselves).
 */
export async function optionPrice(structure: string, ticker: string): Promise<LivePrice | null> {
  const parsed = parseOptionStructure(structure, ticker, todayIso());
  if (!parsed) return null;
  if (parsed.kind === "spread") {
    const { spread: s } = await call(`spread=${encodeURIComponent(parsed.spec)}`);
    return {
      price: s.debit,
      note: `${parsed.label}: ${money(s.debit)}/share (${money(s.cost_per_contract)} per contract), breakeven ${money(s.breakeven)}. Mid of bid/ask, CBOE ~15 min delayed`,
    };
  }
  const { option: o } = await call(`option=${encodeURIComponent(parsed.spec)}`);
  return {
    price: o.mid,
    note: `${parsed.label}: ${money(o.mid)}/share (${money(o.cost_per_contract)} per contract), IV ${o.iv_pct}%, delta ${o.delta}. CBOE ~15 min delayed`,
  };
}

/** Latest regular-session price for many tickers (for refreshing holdings). */
export async function latestPrices(tickers: string[]): Promise<{ ticker: string; price: number; on: string }[]> {
  const out: { ticker: string; price: number; on: string }[] = [];
  for (let i = 0; i < tickers.length; i += 25) {
    const { quotes } = await call(`symbols=${encodeURIComponent(tickers.slice(i, i + 25).join(","))}`);
    for (const q of quotes ?? []) {
      if (q.error || q.price == null) continue;
      out.push({ ticker: q.symbol, price: q.price, on: String(q.as_of ?? todayIso()).slice(0, 10) });
    }
  }
  return out;
}
