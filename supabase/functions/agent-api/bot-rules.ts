/**
 * The paper trading agents ("the bots"): their rules, order validation, P/L and scorecard.
 * Two simulated accounts, each with a rule profile: "steady" (filters the research desk's
 * ideas, with size limits) and "aggressive" (finds its own trades, no size limits).
 *
 * Self-contained on purpose (no imports): tools/sync-payload.sh copies this file into
 * supabase/functions/agent-api/ so the edge function (Deno) enforces exactly the rules
 * the tests cover. A test checks the copies match.
 *
 * Fills never come from the agent. The edge function prices every order from live
 * quotes (buy at the ask, sell at the bid) and checks it against these rules.
 */

export type BotKind = "stock" | "call" | "put" | "call_spread" | "put_spread";
export const BOT_KINDS: BotKind[] = ["stock", "call", "put", "call_spread", "put_spread"];

export const BOT_KIND_LABEL: Record<BotKind, string> = {
  stock: "Shares",
  call: "Call",
  put: "Put",
  call_spread: "Call spread",
  put_spread: "Put spread",
};

export type BotProfileId = "steady" | "aggressive";

/** What an account may do. Percent limits are of current equity; null means no limit beyond cash. */
export interface BotProfile {
  id: BotProfileId;
  name: string;
  /** Kinds it may open. No spreads: Brendan's Robinhood options account can't trade them. */
  kinds: BotKind[];
  stockMaxPct: number | null;
  /** For options, cost = max loss (long calls and puts only). */
  optionMaxLossPct: number | null;
  maxOpen: number | null;
  /** Trading pauses when equity falls this % below the starting cash. */
  killSwitchPct: number | null;
  /** Options must expire at least this many calendar days after the trade opens. */
  minDaysToExpiry: number;
  /** Must every trade start from a research-desk idea? */
  requireIdea: boolean;
}

export const BOT_PROFILES: Record<BotProfileId, BotProfile> = {
  steady: {
    id: "steady",
    name: "Steady",
    kinds: ["stock", "call", "put"],
    stockMaxPct: 20,
    optionMaxLossPct: 6,
    maxOpen: 6,
    killSwitchPct: 25,
    minDaysToExpiry: 7,
    requireIdea: true,
  },
  aggressive: {
    id: "aggressive",
    name: "Aggressive",
    kinds: ["stock", "call", "put"],
    stockMaxPct: null,
    optionMaxLossPct: null,
    maxOpen: null,
    killSwitchPct: null,
    minDaysToExpiry: 7,
    requireIdea: false,
  },
};

export const BOT_RULES = {
  /** The planned real-money pot. Each paper trade is tagged with whether it would fit there. */
  livePot: 2500,
  /** The live account's limits, as % of the pot (the steady profile's). */
  liveStockMaxPct: 20,
  liveOptionMaxLossPct: 6,
  /** Stock fills pay this % of slippage each way (the quote feed has no bid/ask for stocks). */
  stockSlippagePct: 0.05,
} as const;

/** Bearish structures profit when the underlying falls; their stop sits above and the target below. */
export const isBearish = (k: BotKind) => k === "put" || k === "put_spread";
export const isOption = (k: BotKind) => k !== "stock";
/** Spreads need Level 3 options approval (a margin account) at Robinhood, which the live account may not have. */
export const liveEligible = (k: BotKind) => k !== "call_spread" && k !== "put_spread";
const multiplier = (k: BotKind) => (k === "stock" ? 1 : 100);

/** Dollars for qty units at a per-share price (options: premium per share × 100). */
export const positionValue = (k: BotKind, qty: number, price: number) => round2(qty * price * multiplier(k));
export const pnlOf = (k: BotKind, qty: number, entry: number, exit: number) => round2((exit - entry) * qty * multiplier(k));

/** Would this trade fit the $2,500 live account's limits ($500 stock, $150 options)? */
export function fitsLive(k: BotKind, cost: number): boolean {
  const pct = k === "stock" ? BOT_RULES.liveStockMaxPct : BOT_RULES.liveOptionMaxLossPct;
  return cost <= (BOT_RULES.livePot * pct) / 100 + 1e-9;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Option specs, in the quote function's format:
//   TICKER:YYYY-MM-DD:STRIKE{C|P}            single option
//   TICKER:YYYY-MM-DD:LONG/SHORT{C|P}        debit spread (long leg first)

export interface ParsedSpec {
  ticker: string;
  expiry: string;
  type: "C" | "P";
  long: number;
  short?: number;
}

export function parseSpec(spec: string): ParsedSpec | null {
  const m = spec.match(/^([A-Z.]+):(\d{4}-\d{2}-\d{2}):(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?([CP])$/);
  if (!m) return null;
  return { ticker: m[1]!, expiry: m[2]!, type: m[5] as "C" | "P", long: Number(m[3]), ...(m[4] != null ? { short: Number(m[4]) } : {}) };
}

export function kindOfSpec(p: ParsedSpec): BotKind {
  if (p.short == null) return p.type === "C" ? "call" : "put";
  return p.type === "C" ? "call_spread" : "put_spread";
}

// ---------------------------------------------------------------------------
// Orders from the agent

export interface BotOrder {
  /** The research idea (trades.id) this trade comes from. Required for the steady bot. */
  idea_id?: string;
  ticker: string;
  kind: BotKind;
  /** Option spec (see above). Required for options, absent for stock. */
  spec?: string;
  /** Shares, or contracts. */
  qty: number;
  /** Exit levels on the UNDERLYING price, for every kind (the checker watches the stock price). */
  stop: number;
  target: number;
  /** Close by this date (YYYY-MM-DD) if neither level hits. For options, before expiry. */
  exit_by: string;
  /** Why the agent is taking it, in its own words. */
  reasoning: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isText = (v: unknown, min = 1): v is string => typeof v === "string" && v.trim().length >= min;

/** Shape check: right fields, right types. Market-dependent rules come later in checkRules. */
export function validateOrder(body: unknown, profile: BotProfile = BOT_PROFILES.steady): Result<BotOrder> {
  const e: string[] = [];
  const o = (body ?? {}) as Record<string, unknown>;
  if (o.idea_id != null || profile.requireIdea) {
    if (!isText(o.idea_id) || !UUID.test(o.idea_id)) e.push(profile.requireIdea ? "idea_id: the research idea's uuid" : "idea_id: a research idea's uuid, or leave it out");
  }
  if (!isText(o.ticker) || !/^[A-Z][A-Z.]{0,9}$/.test(o.ticker)) e.push("ticker: uppercase symbol, e.g. NVDA");
  if (!profile.kinds.includes(o.kind as BotKind)) e.push(`kind: one of ${profile.kinds.join(", ")}`);
  if (!isNum(o.qty) || o.qty <= 0 || !Number.isInteger(o.qty)) e.push("qty: a whole number of shares or contracts, at least 1");
  if (!isNum(o.stop) || o.stop <= 0) e.push("stop: underlying price that closes the trade as wrong");
  if (!isNum(o.target) || o.target <= 0) e.push("target: underlying price that takes the profit");
  if (!isText(o.exit_by) || !ISO.test(o.exit_by)) e.push("exit_by: YYYY-MM-DD");
  if (!isText(o.reasoning, 20)) e.push("reasoning: at least a sentence on why");
  const kind = o.kind as BotKind;
  if (BOT_KINDS.includes(kind) && isOption(kind)) {
    const p = isText(o.spec) ? parseSpec(o.spec) : null;
    if (!p) e.push("spec: options need e.g. NVDA:2026-11-20:220C or NVDA:2026-11-20:220/230C");
    else {
      if (p.ticker !== o.ticker) e.push("spec: ticker must match");
      if (kindOfSpec(p) !== kind) e.push(`spec: that's a ${kindOfSpec(p)}, not a ${kind}`);
      if (p.short != null) {
        const debit = p.type === "C" ? p.long < p.short : p.long > p.short;
        if (!debit) e.push("spec: debit spreads only: long leg first (calls: lower strike; puts: higher strike)");
      }
    }
  } else if (o.spec != null) e.push("spec: only for options");
  if (isNum(o.stop) && isNum(o.target) && BOT_KINDS.includes(kind)) {
    if (isBearish(kind) ? !(o.target < o.stop) : !(o.stop < o.target)) {
      e.push(isBearish(kind) ? "bearish trade: target must be below stop" : "bullish trade: stop must be below target");
    }
  }
  if (e.length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      ...(o.idea_id != null ? { idea_id: o.idea_id as string } : {}),
      ticker: o.ticker as string,
      kind,
      ...(isOption(kind) ? { spec: o.spec as string } : {}),
      qty: o.qty as number,
      stop: o.stop as number,
      target: o.target as number,
      exit_by: o.exit_by as string,
      reasoning: (o.reasoning as string).trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Resting orders: an order that waits for the underlying to reach a trigger price.
// The checker looks every 10 minutes during the session; when the trigger is met it
// prices and checks the order exactly like an immediate one (so a gap through the
// stop gets refused, not filled).

export type TriggerType = "at_or_below" | "at_or_above";

export interface RestingOrder extends BotOrder {
  /** at_or_below: buy the pullback. at_or_above: buy the breakout (or, for puts, the breakdown is at_or_below). */
  trigger_type: TriggerType;
  /** Underlying price that triggers the order. */
  trigger_price: number;
  /** Optional cap on the fill price per share (options: premium). Above it, the order waits. */
  max_price?: number;
  /** Last day the order can trigger (YYYY-MM-DD). */
  good_until: string;
}

export function triggerHit(type: TriggerType, triggerPrice: number, underlying: number): boolean {
  return type === "at_or_below" ? underlying <= triggerPrice : underlying >= triggerPrice;
}

export function validateRestingOrder(body: unknown, today: string, underlying?: number, profile: BotProfile = BOT_PROFILES.steady): Result<RestingOrder> {
  const base = validateOrder(body, profile);
  const e: string[] = base.ok ? [] : [...base.errors];
  const o = (body ?? {}) as Record<string, unknown>;
  if (o.trigger_type !== "at_or_below" && o.trigger_type !== "at_or_above") e.push("trigger_type: at_or_below or at_or_above");
  if (!isNum(o.trigger_price) || o.trigger_price <= 0) e.push("trigger_price: the underlying price that triggers the order");
  if (o.max_price != null && (!isNum(o.max_price) || o.max_price <= 0)) e.push("max_price: positive, per share (options: premium)");
  if (!isText(o.good_until) || !ISO.test(o.good_until)) e.push("good_until: YYYY-MM-DD");
  else {
    if (o.good_until < today) e.push("good_until is in the past");
    if (isText(o.exit_by) && !(o.good_until < o.exit_by)) e.push("good_until must be before exit_by");
  }
  if (base.ok && isNum(o.trigger_price)) {
    const v = base.value;
    // The trigger has to sit between the stop and the target, or the fill would be refused anyway.
    const [lo, hi] = isBearish(v.kind) ? [v.target, v.stop] : [v.stop, v.target];
    if (!(lo < o.trigger_price && o.trigger_price < hi)) e.push(`trigger_price must be between the stop and the target (${lo}–${hi})`);
    if (underlying != null && triggerHit(o.trigger_type as TriggerType, o.trigger_price, underlying)) {
      e.push(`${v.ticker} is already $${underlying}, past the trigger: open it now instead (bot_open)`);
    }
  }
  if (e.length) return { ok: false, errors: e };
  const v = (base as { ok: true; value: BotOrder }).value;
  return {
    ok: true,
    value: {
      ...v,
      trigger_type: o.trigger_type as TriggerType,
      trigger_price: o.trigger_price as number,
      ...(o.max_price != null ? { max_price: o.max_price as number } : {}),
      good_until: o.good_until as string,
    },
  };
}

export interface AccountState {
  status: "active" | "paused";
  cash: number;
  equity: number;
  openTickers: string[];
  today: string;
}

/** The checks that need the fill price and the account. Returns what's wrong, or an empty list. */
export function checkRules(
  order: BotOrder,
  fill: { price: number; underlying: number },
  acct: AccountState,
  profile: BotProfile = BOT_PROFILES.steady,
): { errors: string[]; cost: number } {
  const e: string[] = [];
  const cost = positionValue(order.kind, order.qty, fill.price);
  if (acct.status !== "active") e.push("account is paused (kill switch); no new trades until Brendan resumes it");
  if (profile.maxOpen != null && acct.openTickers.length >= profile.maxOpen) e.push(`already ${acct.openTickers.length} open positions (max ${profile.maxOpen})`);
  if (acct.openTickers.includes(order.ticker)) e.push(`already holding ${order.ticker}`);
  if (fill.price <= 0) e.push("no usable price to fill at");
  if (cost > acct.cash + 1e-9) e.push(`costs $${cost.toFixed(2)}, cash is $${acct.cash.toFixed(2)}`);
  if (order.kind === "stock") {
    if (profile.stockMaxPct != null) {
      const cap = (acct.equity * profile.stockMaxPct) / 100;
      if (cost > cap + 1e-9) e.push(`stock position $${cost.toFixed(2)} is over ${profile.stockMaxPct}% of equity ($${cap.toFixed(2)})`);
    }
  } else {
    if (profile.optionMaxLossPct != null) {
      const cap = (acct.equity * profile.optionMaxLossPct) / 100;
      if (cost > cap + 1e-9) e.push(`options risk $${cost.toFixed(2)} is over ${profile.optionMaxLossPct}% of equity ($${cap.toFixed(2)})`);
    }
    const p = parseSpec(order.spec!)!;
    const days = (Date.parse(p.expiry) - Date.parse(acct.today)) / 86_400_000;
    if (days < profile.minDaysToExpiry) e.push(`expiry ${p.expiry} is under ${profile.minDaysToExpiry} days away`);
    if (!(order.exit_by < p.expiry)) e.push("exit_by must be before the expiry");
  }
  if (!(order.exit_by > acct.today)) e.push("exit_by must be after today");
  const u = fill.underlying;
  if (isBearish(order.kind) ? !(order.target < u && u < order.stop) : !(order.stop < u && u < order.target)) {
    e.push(`underlying is $${u.toFixed(2)}: it must sit between the stop ($${order.stop}) and the target ($${order.target})`);
  }
  return { errors: e, cost };
}

/** Has the underlying reached the stop or the target? */
export function exitHit(kind: BotKind, stop: number, target: number, underlying: number): "stop" | "target" | null {
  if (isBearish(kind)) {
    if (underlying >= stop) return "stop";
    if (underlying <= target) return "target";
  } else {
    if (underlying <= stop) return "stop";
    if (underlying >= target) return "target";
  }
  return null;
}

/** What an expiring option structure is worth per share, from the underlying alone. */
export function intrinsic(p: ParsedSpec, underlying: number): number {
  const leg = (k: number) => Math.max(0, p.type === "C" ? underlying - k : k - underlying);
  return round2(p.short == null ? leg(p.long) : leg(p.long) - leg(p.short));
}

// ---------------------------------------------------------------------------
// Account math and scorecard

export interface BotPositionLike {
  kind: BotKind;
  status: "open" | "closed";
  qty: number;
  cost: number;
  mark: number | null;
  pnl: number | null;
  fits_live: boolean;
  live_eligible: boolean;
}

export function accountTotals(startingCash: number, positions: BotPositionLike[]) {
  let cash = startingCash;
  let openValue = 0;
  let realized = 0;
  for (const p of positions) {
    if (p.status === "open") {
      cash -= p.cost;
      openValue += p.mark != null ? positionValue(p.kind, p.qty, p.mark) : p.cost;
    } else {
      realized += p.pnl ?? 0;
      cash += p.pnl ?? 0;
    }
  }
  const equity = cash + openValue;
  return {
    cash: round2(cash),
    openValue: round2(openValue),
    equity: round2(equity),
    realized: round2(realized),
    returnPct: startingCash > 0 ? round2(((equity - startingCash) / startingCash) * 100) : 0,
  };
}

/** Kill switch: has equity fallen far enough below the start to pause trading? (Never, for a profile without one.) */
export const killSwitchHit = (startingCash: number, equity: number, profile: BotProfile = BOT_PROFILES.steady) =>
  profile.killSwitchPct != null && equity <= startingCash * (1 - profile.killSwitchPct / 100);

export type ScoreFilter = "all" | "live" | "spreads";

export function scorecard(positions: (BotPositionLike & { cost: number })[], filter: ScoreFilter = "all") {
  const closed = positions.filter(
    (p) =>
      p.status === "closed" &&
      (filter === "all" ||
        (filter === "live" && p.live_eligible && p.fits_live) ||
        (filter === "spreads" && (p.kind === "call_spread" || p.kind === "put_spread"))),
  );
  const wins = closed.filter((p) => (p.pnl ?? 0) > 0);
  const losses = closed.filter((p) => (p.pnl ?? 0) <= 0);
  const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const pct = (p: { pnl: number | null; cost: number }) => (p.cost > 0 ? ((p.pnl ?? 0) / p.cost) * 100 : 0);
  return {
    closed: closed.length,
    wins: wins.length,
    winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : null,
    totalPnl: round2(closed.reduce((a, p) => a + (p.pnl ?? 0), 0)),
    avgWinPct: avg(wins.map(pct)),
    avgLossPct: avg(losses.map(pct)),
  };
}
