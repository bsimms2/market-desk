// The research agent's only door into the database.
//
//   GET  ?action=context   → open trades, recent ideas, active holdings, recent briefings
//   POST ?action=publish   → body is a PublishPayload (see payload.ts)
//
// Auth: header `x-desk-token` must equal the DESK_AGENT_TOKEN secret.
// What it can do is deliberately narrow: insert one briefing, insert its ideas
// with status 'idea', and refresh holdings.last_price. It never updates or
// deletes a trade, and nothing here talks to a brokerage.
//
// The paper trading agent's actions (?action=bot_*) live in bot.ts. They only touch the
// bot_* tables, which hold a simulated account; fills are priced from live quotes.
//
// Secrets (supabase secrets set …): DESK_AGENT_TOKEN, and optionally
// RESEND_API_KEY + NOTIFY_EMAIL for the "briefing ready" email, SITE_URL.

import { createClient } from "npm:@supabase/supabase-js@2";
import { validatePayload } from "./payload.ts";
import { botAdjust, botCancel, botCheck, botClose, botContext, botDecide, botOpen, botOrder } from "./bot.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://bsimms2.github.io/market-desk/";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

function nyToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

async function context(): Promise<Response> {
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since14d = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const [open, recent, holdings, briefings, all, closed, concepts, live, checks] = await Promise.all([
    db.from("trades").select("*").eq("status", "open").order("opened_on"),
    db.from("trades").select("id,created_at,track,ticker,direction,instrument,structure,status,catalyst,invalidation,source_briefing_id")
      .gte("created_at", since).order("created_at", { ascending: false }),
    db.from("holdings").select("ticker,name,kind,shares,cost_basis,account,opened_on,thesis,notes,last_price,last_price_on")
      .eq("active", true).order("ticker"),
    db.from("briefings").select("id,kind,date,title,summary").order("date", { ascending: false })
      .order("created_at", { ascending: false }).limit(8),
    db.from("trades").select("track,status,instrument"),
    db.from("trades").select("track,ticker,direction,instrument,structure,catalyst_type,entry_price,exit_price,opened_on,closed_on,return_pct,lesson")
      .eq("status", "closed").gte("closed_on", since14).order("closed_on", { ascending: false }),
    db.from("concepts").select("term,category,times_explained,first_explained,last_explained,first_briefing_id,understood")
      .order("first_explained"),
    // Ideas still awaiting a decision (status 'idea'), with everything needed to check them.
    db.from("trades").select("id,created_at,track,ticker,direction,instrument,structure,thesis,catalyst,entry_plan,target,invalidation,source_briefing_id")
      .eq("status", "idea").gte("created_at", since30).order("created_at", { ascending: false }),
    db.from("trade_checks").select("trade_id,date,verdict,price,note").gte("date", since14d).order("date", { ascending: false }),
  ]);
  const err = open.error ?? recent.error ?? holdings.error ?? briefings.error ?? all.error ?? closed.error ?? concepts.error ?? live.error ?? checks.error;
  if (err) return json({ error: err.message }, 500);
  return json({
    today_new_york: nyToday(),
    open_trades: open.data,
    recent_ideas_21d: recent.data,
    holdings: holdings.data,
    recent_briefings: briefings.data,
    journal_counts: countBy(all.data ?? []),
    closed_last_14d: closed.data,
    concepts_explained: concepts.data,
    live_ideas: live.data,
    recent_checks: checks.data,
  });
}

/** { swing: { idea: 3, open: 1, ... , option: 2, stock: 2 }, long: {...} } over all time. */
function countBy(rows: { track: string; status: string; instrument: string }[]) {
  const out: Record<string, Record<string, number>> = { swing: {}, long: {} };
  for (const r of rows) {
    const t = (out[r.track] ??= {});
    t[r.status] = (t[r.status] ?? 0) + 1;
    t["total"] = (t["total"] ?? 0) + 1;
  }
  return out;
}

async function publish(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }
  const v = validatePayload(body);
  if (!v.ok) return json({ error: "invalid payload", details: v.errors }, 422);
  const { briefing, ideas, prices, concepts, checks } = v.value;

  // One briefing per kind per date, so a retried run can't double-post.
  const dup = await db.from("briefings").select("id").eq("kind", briefing.kind).eq("date", briefing.date).maybeSingle();
  if (dup.error) return json({ error: dup.error.message }, 500);
  if (dup.data) return json({ error: "already published", briefing_id: dup.data.id }, 409);

  const ins = await db
    .from("briefings")
    .insert({
      kind: briefing.kind,
      date: briefing.date,
      title: briefing.title,
      summary: briefing.summary ?? null,
      body_md: briefing.body_md,
      sources: briefing.sources,
    })
    .select("id")
    .single();
  if (ins.error) return json({ error: ins.error.message }, 500);
  const briefingId = ins.data.id as string;

  let ideaIds: string[] = [];
  if (ideas.length) {
    const rows = ideas.map((i) => ({
      track: i.track,
      ticker: i.ticker,
      direction: i.direction,
      instrument: i.instrument,
      structure: i.structure,
      thesis: i.thesis,
      catalyst: i.catalyst,
      catalyst_type: i.catalyst_type ?? null,
      invalidation: i.invalidation,
      options_angle: i.options_angle,
      entry_plan: i.entry_plan,
      target: i.target,
      status: "idea",
      source_briefing_id: briefingId,
    }));
    const t = await db.from("trades").insert(rows).select("id");
    if (t.error) {
      // Don't leave a briefing that claims ideas it doesn't have.
      await db.from("briefings").delete().eq("id", briefingId);
      return json({ error: "ideas failed, briefing rolled back: " + t.error.message }, 500);
    }
    ideaIds = t.data.map((r) => r.id as string);
  }

  let pricesUpdated = 0;
  for (const p of prices ?? []) {
    const u = await db
      .from("holdings")
      .update({ last_price: p.price, last_price_on: p.on })
      .eq("ticker", p.ticker)
      .eq("active", true)
      .or(`last_price_on.is.null,last_price_on.lte.${p.on}`)
      .select("id");
    if (!u.error) pricesUpdated += u.data.length;
  }

  let conceptsSaved = 0;
  for (const c of concepts ?? []) {
    const term = c.term.trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, "");
    const key = term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // Singular and plural are the same concept ("credit default swap(s)", "debit spread(s)").
    const variants = [...new Set([key, key.endsWith("s") ? key.slice(0, -1) : key + "s"])];
    const found = await db.from("concepts").select("id,times_explained").in("term_key", variants).order("created_at").limit(1).maybeSingle();
    if (found.error) continue;
    const res = found.data
      ? await db.from("concepts").update({ times_explained: found.data.times_explained + 1, last_explained: briefing.date }).eq("id", found.data.id)
      : await db.from("concepts").insert({
          term,
          category: c.category ?? null,
          explanation: c.explanation,
          first_briefing_id: briefingId,
          first_explained: briefing.date,
          last_explained: briefing.date,
        });
    if (!res.error) conceptsSaved++;
  }

  // Check-ins: only for trades that exist; one per trade per briefing.
  let checksSaved = 0;
  if (checks?.length) {
    const ids = [...new Set(checks.map((c) => c.trade_id))];
    const known = await db.from("trades").select("id").in("id", ids);
    const ok = new Set((known.data ?? []).map((r) => r.id as string));
    const rows = checks
      .filter((c) => ok.has(c.trade_id))
      .map((c) => ({ trade_id: c.trade_id, briefing_id: briefingId, date: briefing.date, verdict: c.verdict, price: c.price ?? null, note: c.note }));
    if (rows.length) {
      const ins2 = await db.from("trade_checks").upsert(rows, { onConflict: "trade_id,briefing_id" }).select("id");
      if (!ins2.error) checksSaved = ins2.data.length;
    }
  }

  const notified = await notify(briefing.title, briefing.summary ?? null, briefingId);
  return json({ briefing_id: briefingId, idea_ids: ideaIds, prices_updated: pricesUpdated, concepts_saved: conceptsSaved, checks_saved: checksSaved, notified });
}

async function notify(title: string, summary: string | null, id: string): Promise<string> {
  const key = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("NOTIFY_EMAIL");
  if (!key || !to) return "skipped (no RESEND_API_KEY / NOTIFY_EMAIL)";
  const link = SITE_URL.replace(/\/?$/, "/") + "briefings/" + id;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("NOTIFY_FROM") ?? "Market Desk <onboarding@resend.dev>",
      to: [to],
      subject: `Briefing ready: ${title}`,
      html: `<p><strong>${esc(title)}</strong></p>${summary ? `<p>${esc(summary)}</p>` : ""}<p><a href="${link}">Open the briefing</a></p>`,
      text: `${title}\n\n${summary ?? ""}\n\n${link}`,
    }),
  });
  return r.ok ? "sent" : `failed (${r.status})`;
}

Deno.serve(async (req) => {
  const token = Deno.env.get("DESK_AGENT_TOKEN");
  if (!token) return json({ error: "server not configured" }, 500);
  if (!sameSecret(req.headers.get("x-desk-token") ?? "", token)) return json({ error: "unauthorized" }, 401);

  const action = new URL(req.url).searchParams.get("action");
  try {
    if (req.method === "GET" && action === "context") return await context();
    if (req.method === "POST" && action === "publish") return await publish(req);
    if (req.method === "GET" && action === "bot_context") return await botContext(db, json);
    if (req.method === "POST" && action === "bot_open") return await botOpen(db, req, json);
    if (req.method === "POST" && action === "bot_order") return await botOrder(db, req, json);
    if (req.method === "POST" && action === "bot_cancel") return await botCancel(db, req, json);
    if (req.method === "POST" && action === "bot_decide") return await botDecide(db, req, json);
    if (req.method === "POST" && action === "bot_close") return await botClose(db, req, json);
    if (req.method === "POST" && action === "bot_adjust") return await botAdjust(db, req, json);
    if (req.method === "POST" && action === "bot_check") return await botCheck(db, json);
    return json({ error: "use GET ?action=context|bot_context or POST ?action=publish|bot_open|bot_order|bot_cancel|bot_decide|bot_close|bot_adjust|bot_check" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
