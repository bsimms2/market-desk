/** Row shapes, matching supabase/migrations. Prices are plain dollars (numeric). */

export type Track = "swing" | "long";
export type Direction = "long" | "short";
export type Instrument = "stock" | "option";
export type TradeStatus = "idea" | "open" | "closed" | "passed";
export type BriefingKind = "swing_morning" | "swing_evening" | "long_weekly";
export type HoldingKind = "stock" | "etf" | "option" | "fund" | "other";

export interface Trade {
  id: string;
  created_at: string;
  updated_at: string;
  track: Track;
  ticker: string;
  direction: Direction;
  instrument: Instrument;
  structure: string;
  status: TradeStatus;
  thesis: string | null;
  catalyst: string | null;
  catalyst_type: string | null;
  invalidation: string | null;
  options_angle: string | null;
  entry_plan: string | null;
  target: string | null;
  entry_price: number | null;
  exit_price: number | null;
  opened_on: string | null;
  closed_on: string | null;
  return_pct: number | null;
  lesson: string | null;
  source_briefing_id: string | null;
}

export interface Source {
  title: string;
  url: string;
}

export interface Briefing {
  id: string;
  created_at: string;
  kind: BriefingKind;
  date: string;
  title: string;
  summary: string | null;
  body_md: string;
  sources: Source[];
}

export interface Holding {
  id: string;
  created_at: string;
  updated_at: string;
  ticker: string;
  name: string | null;
  kind: HoldingKind;
  shares: number;
  cost_basis: number | null;
  account: string | null;
  opened_on: string | null;
  thesis: string | null;
  notes: string | null;
  last_price: number | null;
  last_price_on: string | null;
  active: boolean;
}

export const STATUS_LABEL: Record<TradeStatus, string> = {
  idea: "Idea",
  open: "Open",
  closed: "Closed",
  passed: "Passed",
};

export const TRACK_LABEL: Record<Track, string> = { swing: "Swing", long: "Long-term" };

export const BRIEFING_LABEL: Record<BriefingKind, string> = {
  swing_morning: "Swing · morning",
  swing_evening: "Swing · evening recap",
  long_weekly: "Long-term · weekly",
};

export type CheckVerdict = "on_track" | "at_risk" | "invalidated" | "target_hit" | "entry_missed" | "stale";

/** The agent's check-in on an idea or open trade (it labels; it never changes the trade). */
export interface TradeCheck {
  id: string;
  trade_id: string;
  briefing_id: string | null;
  date: string;
  verdict: CheckVerdict;
  price: number | null;
  note: string;
}

export const VERDICT_LABEL: Record<CheckVerdict, string> = {
  on_track: "On track",
  at_risk: "At risk",
  invalidated: "Invalidated",
  target_hit: "Target hit",
  entry_missed: "Entry missed",
  stale: "Stale",
};
