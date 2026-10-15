import React from "react";
import { Platform } from "react-native";
import type { Briefing, Holding, Trade } from "@desk/core";
import { supabase } from "./supabase";

/** Briefing list rows leave out body_md; the full text is fetched when one is opened. */
export type BriefingHead = Pick<Briefing, "id" | "created_at" | "kind" | "date" | "title" | "summary">;

export type TradeDraft = Omit<Trade, "id" | "created_at" | "updated_at">;
export type HoldingDraft = Omit<Holding, "id" | "created_at" | "updated_at">;

interface Data {
  trades: Trade[];
  holdings: Holding[];
  briefings: BriefingHead[];
  loadedAt: number;
  refresh: () => Promise<void>;
  saveTrade: (draft: TradeDraft, id?: string) => Promise<Trade>;
  deleteTrade: (id: string) => Promise<void>;
  saveHolding: (draft: HoldingDraft, id?: string) => Promise<Holding>;
  deleteHolding: (id: string) => Promise<void>;
  setHoldingPrices: (prices: { ticker: string; price: number; on: string }[]) => Promise<number>;
}

const Ctx = React.createContext<Data | null>(null);

/** Full briefing (with body_md and sources), fetched on demand. */
export function useBriefing(id: string | undefined): { briefing: Briefing | null; error: string | null; loading: boolean } {
  const [state, setState] = React.useState<{ briefing: Briefing | null; error: string | null; loading: boolean }>({
    briefing: null,
    error: null,
    loading: !!id,
  });
  React.useEffect(() => {
    if (!id) return;
    let live = true;
    setState({ briefing: null, error: null, loading: true });
    void supabase
      .from("briefings")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setState({ briefing: null, error: error.message, loading: false });
        else if (!data) setState({ briefing: null, error: "That briefing isn't here.", loading: false });
        else setState({ briefing: { ...(data as Briefing), sources: Array.isArray(data.sources) ? data.sources : [] }, error: null, loading: false });
      });
    return () => {
      live = false;
    };
  }, [id]);
  return state;
}

export function useData(): Data {
  const d = React.useContext(Ctx);
  if (!d) throw new Error("useData outside DataProvider");
  return d;
}

/** Numeric columns come back from PostgREST as strings or numbers; normalise to numbers. */
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normTrade(r: any): Trade {
  return { ...r, entry_price: num(r.entry_price), exit_price: num(r.exit_price), return_pct: num(r.return_pct) };
}

function normHolding(r: any): Holding {
  return { ...r, shares: num(r.shares) ?? 0, cost_basis: num(r.cost_basis), last_price: num(r.last_price) };
}

async function fetchAll() {
  const [t, h, b] = await Promise.all([
    supabase.from("trades").select("*").order("created_at", { ascending: false }),
    supabase.from("holdings").select("*").order("ticker"),
    supabase
      .from("briefings")
      .select("id,created_at,kind,date,title,summary")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const err = t.error ?? h.error ?? b.error;
  if (err) throw new Error(err.message);
  return {
    trades: (t.data ?? []).map(normTrade),
    holdings: (h.data ?? []).map(normHolding),
    briefings: (b.data ?? []) as BriefingHead[],
  };
}

export function DataProvider({
  children,
  fallback,
  onError,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
  onError: (msg: string) => void;
}) {
  const [state, setState] = React.useState<{ trades: Trade[]; holdings: Holding[]; briefings: BriefingHead[]; loadedAt: number } | null>(null);

  const loaded = React.useRef(false);

  const refresh = React.useCallback(async () => {
    try {
      const all = await fetchAll();
      loaded.current = true;
      setState({ ...all, loadedAt: Date.now() });
    } catch (e) {
      // Only a failed first load takes over the screen; a background refresh
      // that fails (iPad waking with no network yet) keeps what's shown.
      if (!loaded.current) onError(e instanceof Error ? e.message : String(e));
      else console.warn("refresh failed", e);
    }
  }, [onError]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // A briefing may have landed while the iPad was asleep: refetch when the tab comes back.
  React.useEffect(() => {
    if (Platform.OS !== "web") return;
    let last = Date.now();
    const onFocus = () => {
      if (document.visibilityState === "hidden" || Date.now() - last < 15_000) return;
      last = Date.now();
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const saveTrade = React.useCallback(async (draft: TradeDraft, id?: string) => {
    const q = id
      ? supabase.from("trades").update(draft).eq("id", id).select("*").single()
      : supabase.from("trades").insert(draft).select("*").single();
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const row = normTrade(data);
    setState((s) =>
      s && { ...s, trades: id ? s.trades.map((t) => (t.id === id ? row : t)) : [row, ...s.trades] },
    );
    return row;
  }, []);

  const deleteTrade = React.useCallback(async (id: string) => {
    const { error } = await supabase.from("trades").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setState((s) => s && { ...s, trades: s.trades.filter((t) => t.id !== id) });
  }, []);

  const saveHolding = React.useCallback(async (draft: HoldingDraft, id?: string) => {
    const q = id
      ? supabase.from("holdings").update(draft).eq("id", id).select("*").single()
      : supabase.from("holdings").insert(draft).select("*").single();
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const row = normHolding(data);
    setState((s) => {
      if (!s) return s;
      const holdings = id ? s.holdings.map((h) => (h.id === id ? row : h)) : [...s.holdings, row];
      return { ...s, holdings: holdings.sort((a, b) => a.ticker.localeCompare(b.ticker)) };
    });
    return row;
  }, []);

  const deleteHolding = React.useCallback(async (id: string) => {
    const { error } = await supabase.from("holdings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setState((s) => s && { ...s, holdings: s.holdings.filter((h) => h.id !== id) });
  }, []);

  const setHoldingPrices = React.useCallback(async (prices: { ticker: string; price: number; on: string }[]) => {
    let n = 0;
    for (const p of prices) {
      const { error } = await supabase.from("holdings").update({ last_price: p.price, last_price_on: p.on }).eq("ticker", p.ticker).eq("active", true);
      if (!error) n++;
    }
    setState((s) => {
      if (!s) return s;
      const by = new Map(prices.map((p) => [p.ticker, p]));
      return {
        ...s,
        holdings: s.holdings.map((h) => {
          const p = h.active ? by.get(h.ticker) : undefined;
          return p ? { ...h, last_price: p.price, last_price_on: p.on } : h;
        }),
      };
    });
    return n;
  }, []);

  if (!state) return <>{fallback}</>;
  return (
    <Ctx.Provider value={{ ...state, refresh, saveTrade, deleteTrade, saveHolding, deleteHolding, setHoldingPrices }}>
      {children}
    </Ctx.Provider>
  );
}
