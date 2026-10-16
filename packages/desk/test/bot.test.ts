import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { accountTotals, checkRules, exitHit, fitsLive, intrinsic, killSwitchHit, parseSpec, scorecard, triggerHit, validateOrder, validateRestingOrder, type BotOrder } from "../src";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const IDEA = "54f7bf35-2409-4d6c-936e-b1ac70175f9e";

const stock: BotOrder = { idea_id: IDEA, ticker: "NVDA", kind: "stock", qty: 4, stop: 200, target: 240, exit_by: "2026-11-06", reasoning: "Breakout above resistance into earnings." };
const spread = { ...stock, kind: "call_spread" as const, spec: "NVDA:2026-11-20:220/230C", qty: 1 };
const acct = { status: "active" as const, cash: 5000, equity: 5000, openTickers: [], today: "2026-10-19" };

describe("validateOrder", () => {
  it("accepts a stock and a spread order", () => {
    expect(validateOrder(stock).ok).toBe(true);
    expect(validateOrder(spread).ok).toBe(true);
  });
  it("rejects a credit spread, a mismatched spec and stop above target", () => {
    const r = validateOrder({ ...spread, spec: "NVDA:2026-11-20:230/220C" });
    expect(r.ok).toBe(false);
    expect(validateOrder({ ...spread, kind: "put_spread" }).ok).toBe(false);
    expect(validateOrder({ ...stock, stop: 250 }).ok).toBe(false);
  });
  it("bearish trades put the stop above the target", () => {
    const put = { ...stock, kind: "put", spec: "NVDA:2026-11-20:200P", stop: 240, target: 190 };
    expect(validateOrder(put).ok).toBe(true);
    expect(validateOrder({ ...put, stop: 190, target: 240 }).ok).toBe(false);
  });
  it("needs whole quantities and real reasoning", () => {
    const r = validateOrder({ ...stock, qty: 1.5, reasoning: "yes" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/qty[\s\S]*reasoning/);
  });
});

describe("checkRules", () => {
  it("passes a stock position under 20% of equity", () => {
    expect(checkRules(stock, { price: 215, underlying: 215 }, acct).errors).toEqual([]);
  });
  it("blocks a stock position over 20% of equity", () => {
    const r = checkRules({ ...stock, qty: 5 }, { price: 215, underlying: 215 }, acct);
    expect(r.cost).toBe(1075);
    expect(r.errors.join()).toMatch(/over 20%/);
  });
  it("caps options risk at 6% of equity ($300 on $5,000)", () => {
    expect(checkRules(spread, { price: 2.9, underlying: 215 }, acct).errors).toEqual([]);
    expect(checkRules(spread, { price: 3.1, underlying: 215 }, acct).errors.join()).toMatch(/over 6%/);
  });
  it("blocks when paused, full, already holding, or the price is outside stop/target", () => {
    const r = checkRules(stock, { price: 245, underlying: 245 }, { ...acct, status: "paused", openTickers: ["NVDA", "A", "B", "C", "D", "E"] });
    expect(r.errors.join("\n")).toMatch(/paused[\s\S]*max 6[\s\S]*already holding[\s\S]*between the stop/);
  });
  it("options must have time left and exit before expiry", () => {
    const r = checkRules({ ...spread, spec: "NVDA:2026-10-23:220/230C", exit_by: "2026-10-23" }, { price: 1, underlying: 215 }, acct);
    expect(r.errors.join("\n")).toMatch(/under 7 days[\s\S]*before the expiry/);
  });
});

describe("resting orders", () => {
  const rest = { ...stock, trigger_type: "at_or_below", trigger_price: 210, good_until: "2026-10-23" };
  it("accepts a pullback buy between stop and target", () => {
    expect(validateRestingOrder(rest, "2026-10-19", 216).ok).toBe(true);
  });
  it("refuses a trigger outside stop/target, one already hit, and a late good_until", () => {
    const r = validateRestingOrder({ ...rest, trigger_price: 199, good_until: "2026-11-07" }, "2026-10-19", 216);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/before exit_by[\s\S]*between the stop/);
    const now = validateRestingOrder(rest, "2026-10-19", 209);
    expect(now.ok).toBe(false);
    if (!now.ok) expect(now.errors.join()).toMatch(/open it now/);
  });
  it("triggers on the right side", () => {
    expect(triggerHit("at_or_below", 210, 209.9)).toBe(true);
    expect(triggerHit("at_or_below", 210, 210.1)).toBe(false);
    expect(triggerHit("at_or_above", 230, 230)).toBe(true);
  });
  it("bearish triggers sit between target (low) and stop (high)", () => {
    const put = { ...rest, kind: "put", spec: "NVDA:2026-11-20:200P", stop: 240, target: 190, trigger_type: "at_or_above", trigger_price: 225 };
    expect(validateRestingOrder(put, "2026-10-19", 216).ok).toBe(true);
  });
});

describe("exits and values", () => {
  it("bullish stops below, bearish stops above", () => {
    expect(exitHit("stock", 200, 240, 199)).toBe("stop");
    expect(exitHit("call", 200, 240, 241)).toBe("target");
    expect(exitHit("put", 240, 190, 241)).toBe("stop");
    expect(exitHit("put_spread", 240, 190, 189)).toBe("target");
    expect(exitHit("stock", 200, 240, 220)).toBeNull();
  });
  it("intrinsic value of a spread at expiry", () => {
    expect(intrinsic(parseSpec("NVDA:2026-11-20:220/230C")!, 226)).toBe(6);
    expect(intrinsic(parseSpec("NVDA:2026-11-20:220/230C")!, 240)).toBe(10);
    expect(intrinsic(parseSpec("NVDA:2026-11-20:200P")!, 190)).toBe(10);
  });
  it("fits the $2,500 live pot: $500 stock, $150 options", () => {
    expect(fitsLive("stock", 500)).toBe(true);
    expect(fitsLive("stock", 501)).toBe(false);
    expect(fitsLive("call", 280)).toBe(false);
    expect(fitsLive("call_spread", 150)).toBe(true);
  });
});

describe("account and scorecard", () => {
  const base = { qty: 1, fits_live: true, live_eligible: true };
  const positions = [
    { ...base, kind: "stock" as const, status: "open" as const, qty: 4, cost: 860, mark: 220, pnl: null },
    { ...base, kind: "call_spread" as const, status: "closed" as const, cost: 290, mark: null, pnl: 310, live_eligible: false },
    { ...base, kind: "call" as const, status: "closed" as const, cost: 200, mark: null, pnl: -120 },
  ];
  it("cash, equity and return", () => {
    const t = accountTotals(5000, positions);
    expect(t).toMatchObject({ cash: 4330, openValue: 880, equity: 5210, realized: 190, returnPct: 4.2 });
  });
  it("kill switch at 25% down", () => {
    expect(killSwitchHit(5000, 3751)).toBe(false);
    expect(killSwitchHit(5000, 3750)).toBe(true);
  });
  it("scores all, live-eligible and spreads separately", () => {
    expect(scorecard(positions, "all")).toMatchObject({ closed: 2, wins: 1, winRate: 50, totalPnl: 190 });
    expect(scorecard(positions, "live")).toMatchObject({ closed: 1, wins: 0, totalPnl: -120, avgLossPct: -60 });
    expect(scorecard(positions, "spreads")).toMatchObject({ closed: 1, wins: 1, avgWinPct: 106.9 });
  });
  it("edge function copy matches", () => {
    const a = readFileSync(root + "packages/desk/src/bot.ts", "utf8");
    const b = readFileSync(root + "supabase/functions/agent-api/bot-rules.ts", "utf8");
    expect(b).toBe(a);
  });
});
