import { describe, expect, it } from "vitest";
import { computeReturnPct, cumulativeReturns, daysBetween, fmtPct, parsePrice, trackStats, type Trade } from "../src";

const base: Trade = {
  id: "x", created_at: "", updated_at: "", track: "swing", ticker: "AAA", direction: "long", instrument: "stock",
  structure: "Shares", status: "idea", thesis: null, catalyst: null, catalyst_type: null, invalidation: null,
  options_angle: null, entry_plan: null, target: null, entry_price: null, exit_price: null, opened_on: null,
  closed_on: null, return_pct: null, lesson: null, source_briefing_id: null,
};
const t = (o: Partial<Trade>): Trade => ({ ...base, ...o });

describe("computeReturnPct", () => {
  it("long stock", () => expect(computeReturnPct(100, 110, "long")).toBe(10));
  it("short stock gains when price falls", () => expect(computeReturnPct(100, 90, "short")).toBe(10));
  it("bearish option premium is still long the premium", () => expect(computeReturnPct(2, 3, "short", "option")).toBe(50));
  it("missing fill", () => expect(computeReturnPct(null, 3, "long")).toBeNull());
  it("zero entry", () => expect(computeReturnPct(0, 3, "long")).toBeNull());
});

describe("trackStats", () => {
  const trades = [
    t({ status: "closed", instrument: "stock", entry_price: 100, exit_price: 110 }),
    t({ status: "closed", instrument: "stock", entry_price: 100, exit_price: 95 }),
    t({ status: "closed", instrument: "option", return_pct: 40 }),
    t({ status: "open" }),
    t({ status: "passed" }),
    t({ status: "idea" }),
    t({ track: "long", status: "closed", return_pct: 99 }),
  ];
  const s = trackStats(trades, "swing");
  it("counts", () => expect([s.ideas, s.open, s.closed, s.passed]).toEqual([6, 1, 3, 1]));
  it("taken rate ignores undecided ideas", () => expect(s.takenRate).toBe(80));
  it("splits stock vs option", () => {
    expect(s.stock).toEqual({ closed: 2, wins: 1, winRate: 50, avgReturn: 2.5 });
    expect(s.option).toEqual({ closed: 1, wins: 1, winRate: 100, avgReturn: 40 });
  });
  it("empty track", () => expect(trackStats([], "long").all.winRate).toBeNull());
});

describe("cumulativeReturns", () => {
  it("sums by close date, one point per day", () => {
    const pts = cumulativeReturns([
      t({ status: "closed", closed_on: "2026-10-02", return_pct: -2 }),
      t({ status: "closed", closed_on: "2026-10-01", return_pct: 5 }),
      t({ status: "closed", closed_on: "2026-10-02", return_pct: 1 }),
      t({ status: "open", closed_on: null }),
    ]);
    expect(pts).toEqual([{ date: "2026-10-01", cumPct: 5 }, { date: "2026-10-02", cumPct: 4 }]);
  });
});

describe("formatting", () => {
  it("signs", () => {
    expect(fmtPct(4.23)).toBe("+4.2%");
    expect(fmtPct(-3.1)).toBe("−3.1%");
    expect(fmtPct(0)).toBe("0.0%");
    expect(fmtPct(null)).toBe("—");
  });
  it("parsePrice", () => {
    expect(parsePrice("$1,234.50")).toBe(1234.5);
    expect(parsePrice("  ")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
  });
  it("daysBetween", () => expect(daysBetween("2026-10-01", "2026-10-13")).toBe(12));
});
