import { describe, expect, it } from "vitest";
import { holdingValue, portfolioTotals, type Holding } from "../src";

const h = (o: Partial<Holding>): Holding => ({
  id: "h", created_at: "", updated_at: "", ticker: "AAA", name: null, kind: "stock", shares: 10, cost_basis: 50,
  account: null, opened_on: null, thesis: null, notes: null, last_price: 60, last_price_on: "2026-10-10", active: true, ...o,
});

describe("portfolio", () => {
  it("stock value", () => expect(holdingValue(h({}))).toEqual({ cost: 500, value: 600, gain: 100, gainPct: 20 }));
  it("options are 100 shares per contract", () =>
    expect(holdingValue(h({ kind: "option", shares: 2, cost_basis: 1.5, last_price: 1 })).gain).toBe(-100));
  it("totals skip unpriced and inactive, report oldest price date", () => {
    const tot = portfolioTotals([
      h({}),
      h({ last_price: 40, last_price_on: "2026-10-08" }),
      h({ last_price: null }),
      h({ active: false, last_price: 1000 }),
    ]);
    expect(tot).toEqual({ cost: 1000, value: 1000, gain: 0, gainPct: 0, incomplete: 1, asOf: "2026-10-08" });
  });
  it("nothing priced", () => expect(portfolioTotals([h({ last_price: null })]).value).toBeNull());
});
