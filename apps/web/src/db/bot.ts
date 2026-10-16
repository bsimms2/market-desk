import React from "react";
import { Platform } from "react-native";
import type { BotKind } from "@desk/core";
import { supabase } from "./supabase";
import { liveQuotes, type LiveQuote } from "./quotes";

/** The paper trading agent's account (one row). */
export interface BotAccount {
  starting_cash: number;
  live_pot: number;
  status: "active" | "paused";
  paused_reason: string | null;
  started_on: string | null;
  spy_start: number | null;
}

export interface BotPosition {
  id: string;
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
  created_at: string;
  date: string;
  idea_id: string | null;
  ticker: string;
  verdict: "take" | "skip" | "wait" | "rejected";
  reasoning: string;
  position_id: string | null;
}

export interface BotMark {
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

export interface BotData {
  account: BotAccount;
  positions: BotPosition[];
  decisions: BotDecision[];
  marks: BotMark[];
}

async function fetchBot(): Promise<BotData> {
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const [a, p, d, m] = await Promise.all([
    supabase.from("bot_account").select("*").eq("id", 1).single(),
    supabase.from("bot_positions").select("*").order("created_at", { ascending: false }),
    supabase.from("bot_decisions").select("*").gte("date", since).order("created_at", { ascending: false }),
    supabase.from("bot_marks").select("*").order("date"),
  ]);
  const err = a.error ?? p.error ?? d.error ?? m.error;
  if (err) throw new Error(err.message);
  return {
    account: { ...(a.data as any), starting_cash: Number(a.data.starting_cash), live_pot: Number(a.data.live_pot), spy_start: num(a.data.spy_start) },
    positions: (p.data ?? []).map(normPosition),
    decisions: (d.data ?? []) as BotDecision[],
    marks: (m.data ?? []).map((r: any) => ({ date: r.date, equity: Number(r.equity), cash: Number(r.cash), open_value: Number(r.open_value), spy: num(r.spy) })),
  };
}

/**
 * The bot's tables, refreshed every minute while the screen is open (the checker updates
 * marks every 10), plus live quotes for the open tickers and SPY every 20 seconds while the
 * market is open. Polling stops while the page is hidden.
 */
export function useBot() {
  const [data, setData] = React.useState<BotData | null>(null);
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
    () => ["SPY", ...(data?.positions.filter((p) => p.status === "open").map((p) => p.ticker) ?? [])].join(","),
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

  const resume = React.useCallback(async () => {
    const { error: e } = await supabase.from("bot_account").update({ status: "active", paused_reason: null }).eq("id", 1);
    if (e) throw new Error(e.message);
    await reload();
  }, [reload]);

  return { data, quotes, quotedAt, error, reload, resume };
}
