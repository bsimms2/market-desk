import type { Direction, Instrument, Track, Trade } from "./types";

/**
 * Percent return from entry to exit. Shorts gain when price falls.
 * For options, entry/exit are the premium paid and received, so a debit
 * structure is "long" its premium regardless of the idea's direction.
 */
export function computeReturnPct(
  entry: number | null,
  exit: number | null,
  direction: Direction,
  instrument: Instrument = "stock",
): number | null {
  if (entry == null || exit == null || !Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) return null;
  const raw = ((exit - entry) / entry) * 100;
  const pct = instrument === "stock" && direction === "short" ? -raw : raw;
  return Math.round(pct * 100) / 100;
}

/** Whole calendar days between two YYYY-MM-DD dates (to defaults to today). */
export function daysBetween(from: string, to: string = todayIso()): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function daysHeld(t: Pick<Trade, "opened_on" | "closed_on">, today: string = todayIso()): number | null {
  if (!t.opened_on) return null;
  return daysBetween(t.opened_on, t.closed_on ?? today);
}

/** Local-date YYYY-MM-DD (not UTC: an evening entry in New York is still "today"). */
export function todayIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The effective return of a closed trade: what Brendan entered, else computed from fills. */
export function effectiveReturn(t: Trade): number | null {
  if (t.return_pct != null) return Number(t.return_pct);
  return computeReturnPct(t.entry_price, t.exit_price, t.direction, t.instrument);
}

export interface InstrumentStats {
  closed: number;
  wins: number;
  winRate: number | null; // 0..100
  avgReturn: number | null; // percent
}

export interface TrackStats {
  track: Track;
  ideas: number; // every row logged on this track
  open: number;
  closed: number;
  passed: number;
  /** Of the ideas that were decided (opened, closed or passed), how many were taken. */
  takenRate: number | null;
  all: InstrumentStats;
  stock: InstrumentStats;
  option: InstrumentStats;
}

function instrumentStats(closed: Trade[]): InstrumentStats {
  const rets = closed.map(effectiveReturn).filter((r): r is number => r != null);
  const wins = rets.filter((r) => r > 0).length;
  return {
    closed: closed.length,
    wins,
    winRate: rets.length ? Math.round((wins / rets.length) * 1000) / 10 : null,
    avgReturn: rets.length ? Math.round((rets.reduce((s, r) => s + r, 0) / rets.length) * 100) / 100 : null,
  };
}

export function trackStats(trades: Trade[], track: Track): TrackStats {
  const mine = trades.filter((t) => t.track === track);
  const closed = mine.filter((t) => t.status === "closed");
  const open = mine.filter((t) => t.status === "open").length;
  const passed = mine.filter((t) => t.status === "passed").length;
  const taken = open + closed.length;
  const decided = taken + passed;
  return {
    track,
    ideas: mine.length,
    open,
    closed: closed.length,
    passed,
    takenRate: decided ? Math.round((taken / decided) * 1000) / 10 : null,
    all: instrumentStats(closed),
    stock: instrumentStats(closed.filter((t) => t.instrument === "stock")),
    option: instrumentStats(closed.filter((t) => t.instrument === "option")),
  };
}

/**
 * Running sum of closed-trade returns by close date (equal weight per trade,
 * since paper position sizes vary). Good enough to see the trend.
 */
export function cumulativeReturns(trades: Trade[]): { date: string; cumPct: number }[] {
  const closed = trades
    .filter((t) => t.status === "closed" && t.closed_on && effectiveReturn(t) != null)
    .sort((a, b) => (a.closed_on! < b.closed_on! ? -1 : a.closed_on! > b.closed_on! ? 1 : 0));
  let cum = 0;
  const out: { date: string; cumPct: number }[] = [];
  for (const t of closed) {
    cum += effectiveReturn(t)!;
    const point = { date: t.closed_on!, cumPct: Math.round(cum * 100) / 100 };
    if (out.length && out[out.length - 1]!.date === point.date) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

/** "+4.2%" / "−3.1%" with a real minus sign, so the sign never depends on color alone. */
export function fmtPct(p: number | null | undefined, digits = 1): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const v = Math.abs(p).toFixed(digits);
  if (Number(v) === 0) return v + "%";
  return (p > 0 ? "+" : "−") + v + "%";
}

export function fmtPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse a typed price ("$1,234.5" → 1234.5). Blank → null. */
export function parsePrice(text: string): number | null {
  const t = text.replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
