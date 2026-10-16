// The paper trading agent's actions, served by agent-api (see index.ts for routing and auth).
//
//   GET  ?action=bot_context  → account, rules, open/closed positions, ideas to review, recent decisions
//   POST ?action=bot_open     → BotOrder (bot-rules.ts); priced here from live quotes, checked, filled.
//                               Add "preview": true to get the price and rule check without trading.
//   POST ?action=bot_decide   → { decisions: [{ idea_id, ticker, verdict: skip|wait, reasoning }] }
//   POST ?action=bot_close    → { position_id, note }  close at the bid, now
//   POST ?action=bot_adjust   → { position_id, stop?, target?, exit_by?, note }  (stops only tighten)
//   POST ?action=bot_check    → the scheduled checker (pg_cron, every 10 min on weekdays):
//                               marks positions, closes stop/target/time hits, kill switch, daily snapshot
//
// Everything is simulated. The agent never supplies a price: buys fill at the ask, sells at the
// bid (stocks: last price plus/minus slippage), during the regular session only.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { cboeChain, midOf, occOf, snapExpiry, stockQuote } from "../_shared/market.ts";
import {
  accountTotals,
  BOT_RULES,
  checkRules,
  exitHit,
  fitsLive,
  intrinsic,
  isBearish,
  isOption,
  killSwitchHit,
  liveEligible,
  parseSpec,
  pnlOf,
  round2,
  validateOrder,
  type BotKind,
  type BotPositionLike,
} from "./bot-rules.ts";

type Json = (body: unknown, status?: number) => Response;

interface Position extends BotPositionLike {
  id: string;
  created_at: string;
  idea_id: string | null;
  ticker: string;
  spec: string | null;
  entry_price: number;
  entry_underlying: number;
  stop: number;
  target: number;
  exit_by: string;
  reasoning: string;
  mark_underlying: number | null;
  marked_at: string | null;
  closed_at: string | null;
  exit_price: number | null;
  exit_reason: string | null;
}

const NUMS = ["qty", "entry_price", "entry_underlying", "cost", "stop", "target", "mark", "mark_underlying", "exit_price", "exit_underlying", "pnl"];
function norm(r: Record<string, unknown>): Position {
  const o: Record<string, unknown> = { ...r };
  for (const k of NUMS) o[k] = r[k] == null ? null : Number(r[k]);
  return o as unknown as Position;
}

export function nyNow(d = new Date()): { date: string; minutes: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// ---------------------------------------------------------------------------
// Prices

type Chains = Map<string, any>;

async function chainFor(ticker: string, chains: Chains) {
  if (!chains.has(ticker)) chains.set(ticker, await cboeChain(ticker));
  return chains.get(ticker);
}

/**
 * Per-share price of an option structure. buy = ask (spreads: long ask − short bid),
 * sell = bid (spreads: long bid − short ask), mark = mid. A contract that's no longer
 * listed (expired) is worth its intrinsic value.
 */
async function optionPrice(spec: string, side: "buy" | "sell" | "mark", underlying: number, chains: Chains): Promise<{ price: number; spec: string; listed: boolean }> {
  const p = parseSpec(spec);
  if (!p) throw new Error(`bad spec ${spec}`);
  const j = await chainFor(p.ticker, chains);
  const opts = j.data.options as any[];
  const expiry = snapExpiry(opts, p.ticker, p.expiry);
  const find = (k: number) => opts.find((o) => o.option === occOf(p.ticker, expiry, p.type, String(k)));
  const L = find(p.long);
  const S = p.short != null ? find(p.short) : undefined;
  const used = `${p.ticker}:${expiry}:${p.long}${p.short != null ? "/" + p.short : ""}${p.type}`;
  if (!L || (p.short != null && !S)) {
    if (side === "buy") throw new Error(`${used}: contract not found in the CBOE chain`);
    return { price: intrinsic(p, underlying), spec: used, listed: false };
  }
  let price: number;
  if (side === "mark") price = S ? midOf(L) - midOf(S) : midOf(L);
  else if (side === "buy") {
    if (!(L.ask > 0) || (S && !(S.bid >= 0))) throw new Error(`${used}: no ask quoted`);
    price = S ? L.ask - S.bid : L.ask;
  } else price = Math.max(0, S ? L.bid - S.ask : L.bid);
  return { price: round2(Math.max(0, price)), spec: used, listed: true };
}

const slip = (price: number, side: "buy" | "sell") => round2(price * (1 + ((side === "buy" ? 1 : -1) * BOT_RULES.stockSlippagePct) / 100));

async function quotes(tickers: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const res = await Promise.all([...new Set(tickers)].map(stockQuote));
  for (const q of res) out.set(q.symbol, q);
  return out;
}

// ---------------------------------------------------------------------------
// Account

async function loadAccount(db: SupabaseClient) {
  const [a, p] = await Promise.all([db.from("bot_account").select("*").eq("id", 1).single(), db.from("bot_positions").select("*").order("created_at", { ascending: false })]);
  if (a.error) throw new Error(a.error.message);
  if (p.error) throw new Error(p.error.message);
  const account = { ...a.data, starting_cash: Number(a.data.starting_cash), live_pot: Number(a.data.live_pot), spy_start: a.data.spy_start == null ? null : Number(a.data.spy_start) };
  const positions = (p.data ?? []).map(norm);
  return { account, positions, totals: accountTotals(account.starting_cash, positions) };
}

async function closePosition(db: SupabaseClient, pos: Position, reason: "stop" | "target" | "time" | "agent" | "expiry", note: string, underlying: number, chains: Chains) {
  const exit = pos.kind === "stock" ? { price: slip(underlying, "sell"), listed: true } : await optionPrice(pos.spec!, "sell", underlying, chains);
  const pnl = pnlOf(pos.kind, pos.qty, pos.entry_price, exit.price);
  const finalReason = !exit.listed && reason !== "agent" ? "expiry" : reason;
  const u = await db
    .from("bot_positions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      exit_price: exit.price,
      exit_underlying: underlying,
      exit_reason: finalReason,
      exit_note: note,
      pnl,
      mark: exit.price,
      mark_underlying: underlying,
      marked_at: new Date().toISOString(),
    })
    .eq("id", pos.id)
    .eq("status", "open")
    .select("id");
  if (u.error) throw new Error(u.error.message);
  return { id: pos.id, ticker: pos.ticker, reason: finalReason, exit_price: exit.price, underlying, pnl };
}

// ---------------------------------------------------------------------------
// Actions

export async function botContext(db: SupabaseClient, json: Json): Promise<Response> {
  const { account, positions, totals } = await loadAccount(db);
  const since10 = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const [ideas, decisions, checks, spyQuote] = await Promise.all([
    db.from("trades").select("id,created_at,ticker,direction,instrument,structure,status,thesis,catalyst,catalyst_type,invalidation,options_angle,entry_plan,target,source_briefing_id")
      .eq("track", "swing").not("source_briefing_id", "is", null).in("status", ["idea", "open"]).gte("created_at", since10).order("created_at", { ascending: false }),
    db.from("bot_decisions").select("date,idea_id,ticker,verdict,reasoning,position_id").gte("date", since14).order("created_at", { ascending: false }),
    db.from("trade_checks").select("trade_id,date,verdict,price,note").gte("date", since14).order("date", { ascending: false }),
    stockQuote("SPY"),
  ]);
  const err = ideas.error ?? decisions.error ?? checks.error;
  if (err) return json({ error: err.message }, 500);
  const spy = spyQuote as any;
  const open = positions.filter((p) => p.status === "open");
  const heldIdeas = new Set(positions.map((p) => p.idea_id));
  const ideaRows = (ideas.data ?? []).map((i: any) => ({
    ...i,
    latest_check: (checks.data ?? []).find((c: any) => c.trade_id === i.id) ?? null,
    bot_history: (decisions.data ?? []).filter((d: any) => d.idea_id === i.id),
    bot_has_traded_it: heldIdeas.has(i.id),
  }));
  return json({
    today_new_york: nyNow().date,
    market: { session: spy.session, spy: spy.price, as_of: spy.as_of },
    account: {
      status: account.status,
      paused_reason: account.paused_reason,
      starting_cash: account.starting_cash,
      started_on: account.started_on,
      ...totals,
      open_slots: BOT_RULES.maxOpen - open.length,
      max_stock_position: round2((totals.equity * BOT_RULES.stockMaxPct) / 100),
      max_option_risk: round2((totals.equity * BOT_RULES.optionMaxLossPct) / 100),
      live_pot: account.live_pot,
      live_max_stock_position: round2((account.live_pot * BOT_RULES.stockMaxPct) / 100),
      live_max_option_risk: round2((account.live_pot * BOT_RULES.optionMaxLossPct) / 100),
    },
    rules: BOT_RULES,
    open_positions: open,
    closed_last_30d: positions.filter((p) => p.status === "closed" && p.closed_at! >= new Date(Date.now() - 30 * 86_400_000).toISOString()),
    ideas_to_review: ideaRows,
    recent_decisions: decisions.data,
  });
}

export async function botOpen(db: SupabaseClient, req: Request, json: Json): Promise<Response> {
  const body = await req.json().catch(() => null);
  const preview = body?.preview === true;
  const v = validateOrder(body);
  if (!v.ok) return json({ error: "invalid order", details: v.errors }, 422);
  const order = v.value;
  const idea = await db.from("trades").select("id,ticker").eq("id", order.idea_id).maybeSingle();
  if (idea.error) return json({ error: idea.error.message }, 500);
  if (!idea.data) return json({ error: "idea_id is not a research idea" }, 422);

  const today = nyNow().date;
  const q = (await quotes([order.ticker])).get(order.ticker);
  if (!q || q.error || q.price == null) return json({ error: `no quote for ${order.ticker}` }, 502);
  if (q.session !== "regular") return json({ error: `market is ${q.session}; orders fill during the regular session only` }, 409);

  let price: number;
  let spec: string | null = null;
  try {
    if (order.kind === "stock") price = slip(q.price, "buy");
    else {
      const o = await optionPrice(order.spec!, "buy", q.price, new Map());
      price = o.price;
      spec = o.spec;
      order.spec = o.spec; // expiry may have snapped to the listed Friday
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 422);
  }

  const { account, positions, totals } = await loadAccount(db);
  const open = positions.filter((p) => p.status === "open");
  const { errors, cost } = checkRules(order, { price, underlying: q.price }, {
    status: account.status,
    cash: totals.cash,
    equity: totals.equity,
    openTickers: open.map((p) => p.ticker),
    today,
  });
  if (preview) {
    return json({ preview: true, ok: errors.length === 0, errors, fill_price: price, cost, spec, underlying: q.price, fits_live: fitsLive(order.kind, cost), live_eligible: liveEligible(order.kind), cash: totals.cash, equity: totals.equity });
  }
  if (errors.length) {
    await db.from("bot_decisions").insert({ date: today, idea_id: order.idea_id, ticker: order.ticker, verdict: "rejected", reasoning: `${order.reasoning}\n\nRejected by the rules at $${price}: ${errors.join("; ")}` });
    return json({ error: "order breaks the rules", details: errors, fill_price: price, cost, underlying: q.price }, 422);
  }

  const ins = await db
    .from("bot_positions")
    .insert({
      idea_id: order.idea_id,
      ticker: order.ticker,
      kind: order.kind,
      spec,
      qty: order.qty,
      entry_price: price,
      entry_underlying: q.price,
      cost,
      stop: order.stop,
      target: order.target,
      exit_by: order.exit_by,
      reasoning: order.reasoning,
      fits_live: fitsLive(order.kind, cost),
      live_eligible: liveEligible(order.kind),
      mark: price,
      mark_underlying: q.price,
      marked_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (ins.error) return json({ error: ins.error.message }, 500);
  await db.from("bot_decisions").insert({ date: today, idea_id: order.idea_id, ticker: order.ticker, verdict: "take", reasoning: order.reasoning, position_id: ins.data.id });
  if (!account.started_on) {
    // The first trade starts the clock for the SPY comparison.
    const spy: any = order.ticker === "SPY" ? q : (await quotes(["SPY"])).get("SPY");
    await db.from("bot_account").update({ started_on: today, spy_start: spy?.price ?? null }).eq("id", 1);
  }
  return json({ opened: norm(ins.data), cash_left: round2(totals.cash - cost) });
}

export async function botDecide(db: SupabaseClient, req: Request, json: Json): Promise<Response> {
  const body = await req.json().catch(() => null);
  const list = Array.isArray(body?.decisions) ? body.decisions : null;
  if (!list?.length) return json({ error: "body: { decisions: [{ idea_id, ticker, verdict: skip|wait, reasoning }] }" }, 422);
  const errors: string[] = [];
  list.forEach((d: any, i: number) => {
    if (typeof d?.idea_id !== "string") errors.push(`decisions[${i}].idea_id`);
    if (typeof d?.ticker !== "string" || !d.ticker) errors.push(`decisions[${i}].ticker`);
    if (d?.verdict !== "skip" && d?.verdict !== "wait") errors.push(`decisions[${i}].verdict: skip or wait (take = bot_open)`);
    if (typeof d?.reasoning !== "string" || d.reasoning.trim().length < 20) errors.push(`decisions[${i}].reasoning: at least a sentence`);
  });
  if (errors.length) return json({ error: "invalid decisions", details: errors }, 422);
  const today = nyNow().date;
  const rows = list.map((d: any) => ({ date: today, idea_id: d.idea_id, ticker: d.ticker.toUpperCase(), verdict: d.verdict, reasoning: d.reasoning.trim() }));
  const ins = await db.from("bot_decisions").insert(rows).select("id");
  if (ins.error) return json({ error: ins.error.message }, 500);
  return json({ saved: ins.data.length });
}

async function openPosition(db: SupabaseClient, id: unknown): Promise<Position | null> {
  if (typeof id !== "string") return null;
  const r = await db.from("bot_positions").select("*").eq("id", id).eq("status", "open").maybeSingle();
  return r.data ? norm(r.data) : null;
}

export async function botClose(db: SupabaseClient, req: Request, json: Json): Promise<Response> {
  const body = await req.json().catch(() => null);
  const pos = await openPosition(db, body?.position_id);
  if (!pos) return json({ error: "position_id: not an open position" }, 422);
  if (typeof body?.note !== "string" || body.note.trim().length < 10) return json({ error: "note: why you're closing it" }, 422);
  const q = (await quotes([pos.ticker])).get(pos.ticker);
  if (!q || q.price == null) return json({ error: `no quote for ${pos.ticker}` }, 502);
  if (q.session !== "regular") return json({ error: `market is ${q.session}; closes fill during the regular session only` }, 409);
  return json({ closed: await closePosition(db, pos, "agent", body.note.trim(), q.price, new Map()) });
}

export async function botAdjust(db: SupabaseClient, req: Request, json: Json): Promise<Response> {
  const body = await req.json().catch(() => null);
  const pos = await openPosition(db, body?.position_id);
  if (!pos) return json({ error: "position_id: not an open position" }, 422);
  if (typeof body?.note !== "string" || body.note.trim().length < 10) return json({ error: "note: why you're changing it" }, 422);
  const stop = body.stop ?? pos.stop;
  const target = body.target ?? pos.target;
  const exit_by = body.exit_by ?? pos.exit_by;
  const bear = isBearish(pos.kind as BotKind);
  const errors: string[] = [];
  if (typeof stop !== "number" || typeof target !== "number" || stop <= 0 || target <= 0) errors.push("stop/target: positive numbers");
  else if (bear ? !(target < stop) : !(stop < target)) errors.push("stop and target are the wrong way round for this trade");
  // A stop may only tighten (move toward the price), never widen: that's how small losses become big ones.
  else if (bear ? stop > pos.stop : stop < pos.stop) errors.push(`stop can only tighten: ${pos.stop} to ${stop} widens it`);
  if (typeof exit_by !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(exit_by) || exit_by <= nyNow().date) errors.push("exit_by: a future YYYY-MM-DD");
  else if (isOption(pos.kind) && !(exit_by < parseSpec(pos.spec!)!.expiry)) errors.push("exit_by must be before the expiry");
  if (errors.length) return json({ error: "invalid adjustment", details: errors }, 422);
  const log = `${pos.reasoning}\n\n[${nyNow().date}] Adjusted stop ${pos.stop} to ${stop}, target ${pos.target} to ${target}, exit by ${pos.exit_by} to ${exit_by}: ${body.note.trim()}`;
  const u = await db.from("bot_positions").update({ stop, target, exit_by, reasoning: log }).eq("id", pos.id).select("*").single();
  if (u.error) return json({ error: u.error.message }, 500);
  return json({ adjusted: norm(u.data) });
}

/** The scheduled checker. Safe to call any time: it only acts in the session, and snapshots once after the close. */
export async function botCheck(db: SupabaseClient, json: Json): Promise<Response> {
  const ny = nyNow();
  const { positions } = await loadAccount(db);
  const open = positions.filter((p) => p.status === "open");
  const q = await quotes(["SPY", ...open.map((p) => p.ticker)]);
  const spy = q.get("SPY");
  const session = spy?.session ?? "closed";
  const out: Record<string, unknown> = { session, ny_time: `${Math.floor(ny.minutes / 60)}:${String(ny.minutes % 60).padStart(2, "0")}`, marked: 0 };
  const closed: unknown[] = [];
  const errors: string[] = [];
  const chains: Chains = new Map();

  if (session === "regular") {
    for (const pos of open) {
      const u = q.get(pos.ticker)?.price;
      if (u == null) continue;
      try {
        const hit = exitHit(pos.kind as BotKind, pos.stop, pos.target, u);
        const lastHalfHour = ny.minutes >= 15 * 60 + 30;
        const expiring = isOption(pos.kind) && parseSpec(pos.spec!)!.expiry <= ny.date;
        if (hit || (pos.exit_by <= ny.date && lastHalfHour) || expiring) {
          const reason = hit ?? (expiring ? "expiry" : "time");
          const note = hit === "stop" ? `Underlying $${u} reached the stop ($${pos.stop})` : hit === "target" ? `Underlying $${u} reached the target ($${pos.target})` : expiring ? "Expiry day" : `Exit-by date ${pos.exit_by}`;
          closed.push(await closePosition(db, pos, reason, note, u, chains));
          continue;
        }
        const mark = pos.kind === "stock" ? u : (await optionPrice(pos.spec!, "mark", u, chains)).price;
        await db.from("bot_positions").update({ mark, mark_underlying: u, marked_at: new Date().toISOString() }).eq("id", pos.id);
        out.marked = (out.marked as number) + 1;
      } catch (e) {
        errors.push(`${pos.ticker}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  out.closed = closed;
  if (errors.length) out.errors = errors;

  const after = await loadAccount(db);
  out.equity = after.totals.equity;
  if (after.account.status === "active" && killSwitchHit(after.account.starting_cash, after.totals.equity)) {
    await db.from("bot_account").update({ status: "paused", paused_reason: `Kill switch: equity $${after.totals.equity} is ${BOT_RULES.killSwitchPct}%+ below the $${after.account.starting_cash} start (${ny.date})` }).eq("id", 1);
    out.paused = true;
  }

  // Daily snapshot: after the close, on a day the market traded (SPY's last trade is today).
  const tradedToday = String(spy?.as_of ?? "").startsWith(ny.date);
  if (session !== "regular" && ny.minutes >= 16 * 60 && tradedToday && after.account.started_on) {
    const m = await db.from("bot_marks").upsert({ date: ny.date, equity: after.totals.equity, cash: after.totals.cash, open_value: after.totals.openValue, spy: spy?.price ?? null }, { onConflict: "date" });
    out.snapshot = m.error ? m.error.message : ny.date;
  }
  return json(out);
}
