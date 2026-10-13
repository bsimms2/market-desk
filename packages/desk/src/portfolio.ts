import type { Holding } from "./types";

export interface HoldingValue {
  cost: number | null; // total cost basis
  value: number | null; // shares × last price
  gain: number | null;
  gainPct: number | null;
}

export function holdingValue(h: Pick<Holding, "shares" | "cost_basis" | "last_price" | "kind">): HoldingValue {
  // Listed options quote per share; one contract is 100 shares.
  const mult = h.kind === "option" ? 100 : 1;
  const shares = Number(h.shares) * mult;
  const cost = h.cost_basis != null ? round2(shares * Number(h.cost_basis)) : null;
  const value = h.last_price != null ? round2(shares * Number(h.last_price)) : null;
  const gain = cost != null && value != null ? round2(value - cost) : null;
  const gainPct = gain != null && cost ? Math.round((gain / cost) * 10000) / 100 : null;
  return { cost, value, gain, gainPct };
}

export interface PortfolioTotals extends HoldingValue {
  /** Holdings missing a price or cost, left out of the totals. */
  incomplete: number;
  /** Oldest last_price_on among priced holdings: totals are "as of" this. */
  asOf: string | null;
}

export function portfolioTotals(holdings: Holding[]): PortfolioTotals {
  let cost = 0;
  let value = 0;
  let incomplete = 0;
  let asOf: string | null = null;
  for (const h of holdings) {
    if (!h.active) continue;
    const v = holdingValue(h);
    if (v.cost == null || v.value == null) {
      incomplete++;
      continue;
    }
    cost += v.cost;
    value += v.value;
    if (h.last_price_on && (asOf == null || h.last_price_on < asOf)) asOf = h.last_price_on;
  }
  const priced = holdings.filter((h) => h.active).length - incomplete;
  if (!priced) return { cost: null, value: null, gain: null, gainPct: null, incomplete, asOf };
  const gain = round2(value - cost);
  return {
    cost: round2(cost),
    value: round2(value),
    gain,
    gainPct: cost ? Math.round((gain / cost) * 10000) / 100 : null,
    incomplete,
    asOf,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
