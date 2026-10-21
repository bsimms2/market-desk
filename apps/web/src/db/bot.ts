import React from "react";
import { Platform } from "react-native";
import type { BotKind } from "@desk/core";
import { supabase } from "./supabase";
import { liveQuotes, type LiveQuote } from "./quotes";

/** A paper trading account: "steady" (id 1) or "aggressive" (id 2). */
export interface BotAccount {
  id: number;
  slug: "steady" | "aggressive";
  name: string;
  profile: "steady" | "aggressive";
  starting_cash: number;
  live_pot: number;
  status: "active" | "paused";
  paused_reason: string | null;
  started_on: string | null;
  spy_start: number | null;
}

export interface BotPosition {
  id: string;
  account_id: number;
  created_at: string;
  idea_id: string | null;
  ticker: string;
  kind: BotKind;
  spec: string | null;
  qty: number;
  entry_price: number;
  entry_underlying: number;
  cost: number;
  stop: number;
  target: number;
  exit_by: string;
  reasoning: string;
  fits_live: boolean;
  live_eligible: boolean;
  status: "open" | "closed";
  mark: number | null;
  mark_underlying: number | null;
  marked_at: string | null;
  closed_at: string | null;
  exit_price: number | null;
  exit_underlying: number | null;
  exit_reason: "stop" | "target" | "time" | "agent" | "expiry" | null;
  exit_note: string | null;
  pnl: number | null;
}

export interface BotDecision {
  id: string;
  account_id: number;
  created_at: string;
  date: string;
  idea_id: string | null;
  ticker: string;
  verdict: "take" | "skip" | "wait" | "rejected" | "order" | "cancel";
  reasoning: string;
  position_id: string | null;
  order_id: string | null;
}

/** A resting order: buys when the underlying reaches the trigger (the checker looks every 10 min). */
export interface BotOrder {
  id: string;
  account_id: number;
  created_at: string;
  idea_id: string | null;
  ticker: string;
  kind: BotKind;
  spec: string | null;
  qty: number;
  stop: number;
  target: number;
  exit_by: string;
  reasoning: string;
  trigger_type: "at_or_below" | "at_or_above";
  trigger_price: number;
  max_price: number | null;
  good_until: string;
  status: "pending" | "filled" | "cancelled" | "expired" | "rejected";
  resolved_at: string | null;
  note: string | null;
}

export interface BotMark {
  account_id: number;
  date: string;
  equity: number;
  cash: number;
  open_value: number;
  spy: number | null;
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const POS_NUMS = ["qty", "entry_price", "entry_underlying", "cost", "stop", "target", "mark", "mark_underlying", "exit_price", "exit_underlying", "pnl"] as const;

function normPosition(r: any): BotPosition {
  const o = { ...r };
  for (const k of POS_NUMS) o[k] = num(r[k]);
  return o as BotPosition;
}

/** One account's slice of the data. */
export interface BotData {
  account: BotAccount;
  positions: BotPosition[];
  decisions: BotDecision[];
  marks: BotMark[];
  /** Pending orders, plus the ones resolved in the last 45 days. */
  orders: BotOrder[];
}

/** Every account's data. */
export interface BotAll {
  accounts: BotAccount[];
  positions: BotPosition[];
  decisions: BotDecision[];
  marks: BotMark[];
  orders: BotOrder[];
}

export function accountView(all: BotAll, accountId: number): BotData | null {
  const account = all.accounts.find((a) => a.id === accountId);
  if (!account) return null;
  const mine = <T extends { account_id: number }>(xs: T[]) => xs.filter((x) => x.account_id === accountId);
  return { account, positions: mine(all.positions), decisions: mine(all.decisions), marks: mine(all.marks), orders: mine(all.orders) };
}

async function fetchBot(): Promise<BotAll> {
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const [a, p, d, m, o] = await Promise.all([
    supabase.from("bot_account").select("*").order("id"),
    supabase.from("bot_positions").select("*").order("created_at", { ascending: false }),
    supabase.from("bot_decisions").select("*").gte("date", since).order("created_at", { ascending: false }),
    supabase.from("bot_marks").select("*").order("date"),
    supabase.from("bot_orders").select("*").or(`status.eq.pending,created_at.gte.${since}`).order("created_at", { ascending: false }),
  ]);
  const err = a.error ?? p.error ?? d.error ?? m.error ?? o.error;
  if (err) throw new Error(err.message);
  return {
    accounts: (a.data ?? []).map((r: any) => ({ ...r, starting_cash: Number(r.starting_cash), live_pot: Number(r.live_pot), spy_start: num(r.spy_start) })),
    positions: (p.data ?? []).map(normPosition),
    decisions: (d.data ?? []) as BotDecision[],
    orders: (o.data ?? []).map((r: any) => ({ ...r, qty: Number(r.qty), stop: Number(r.stop), target: Number(r.target), trigger_price: Number(r.trigger_price), max_price: num(r.max_price) })),
    marks: (m.data ?? []).map((r: any) => ({ account_id: r.account_id, date: r.date, equity: Number(r.equity), cash: Number(r.cash), open_value: Number(r.open_value), spy: num(r.spy) })),
  };
}

/**
 * Both bots' tables, refreshed every minute while the screen is open (the checker updates
 * marks every 10), plus live quotes for the open tickers and SPY every 20 seconds while the
 * market is open. Polling stops while the page is hidden.
 */
export function useBot() {
  const [data, setData] = React.useState<BotAll | null>(null);
  const [quotes, setQuotes] = React.useState<Map<string, LiveQuote>>(new Map());
  const [error, setError] = React.useState<string | null>(null);
  const [quotedAt, setQuotedAt] = React.useState<number | null>(null);

  const reload = React.useCallback(async () => {
    try {
      setData(await fetchBot());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const tickers = React.useMemo(
    () =>
      [
        "SPY",
        ...(data?.positions.filter((p) => p.status === "open").map((p) => p.ticker) ?? []),
        ...(data?.orders.filter((o) => o.status === "pending").map((o) => o.ticker) ?? []),
      ].join(","),
    [data],
  );

  const requote = React.useCallback(async () => {
    try {
      setQuotes(await liveQuotes(tickers.split(",")));
      setQuotedAt(Date.now());
    } catch (e) {
      console.warn("quotes failed", e);
    }
  }, [tickers]);

  const hidden = () => Platform.OS === "web" && document.visibilityState === "hidden";

  React.useEffect(() => {
    void reload();
    const id = setInterval(() => !hidden() && void reload(), 60_000);
    return () => clearInterval(id);
  }, [reload]);

  const session = quotes.get("SPY")?.session;
  React.useEffect(() => {
    if (!data) return;
    void requote();
    // Fast while the market is open; once a minute otherwise (to notice the open).
    const every = session === "regular" ? 20_000 : 60_000;
    const id = setInterval(() => !hidden() && void requote(), every);
    return () => clearInterval(id);
  }, [requote, session, !!data]);

  const resume = React.useCallback(async (accountId: number) => {
    const { error: e } = await supabase.from("bot_account").update({ status: "active", paused_reason: null }).eq("id", accountId);
    if (e) throw new Error(e.message);
    await reload();
  }, [reload]);

  return { data, quotes, quotedAt, error, reload, resume };
}
