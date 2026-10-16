/**
 * The agent's publish payload and its validator.
 *
 * Self-contained on purpose (no imports): the same file is copied into
 * supabase/functions/agent-api/ by tools/sync-payload.sh so the edge function
 * (Deno) and the local script validate identically. A test checks the copies match.
 */

export interface IdeaInput {
  track: "swing" | "long";
  ticker: string;
  direction: "long" | "short";
  instrument: "stock" | "option";
  structure: string;
  thesis: string;
  catalyst: string;
  catalyst_type?: string | null;
  invalidation: string;
  options_angle: string;
  entry_plan: string;
  target: string;
}

export interface BriefingInput {
  kind: "swing_morning" | "swing_evening" | "long_weekly";
  date: string;
  title: string;
  summary?: string | null;
  body_md: string;
  sources: { title: string; url: string }[];
}

export interface PriceInput {
  ticker: string;
  price: number;
  on: string;
}

export const CHECK_VERDICTS = ["on_track", "at_risk", "invalidated", "target_hit", "entry_missed", "stale"] as const;

/** The agent's verdict on an existing idea or open trade. Labels it; never changes the trade. */
export interface CheckInput {
  trade_id: string;
  verdict: (typeof CHECK_VERDICTS)[number];
  /** Price checked against (stock price, or the option/spread's value for option trades). */
  price?: number;
  /** One line: why, against the entry zone / target / wrong-if. */
  note: string;
}

export interface ConceptInput {
  /** Short canonical name, e.g. "IV crush", "debit spread", "yield curve". */
  term: string;
  /** One or two plain sentences: what it is and why it mattered in this briefing. */
  explanation: string;
  category?: "options" | "macro" | "rates" | "valuation" | "technical" | "risk" | "earnings" | "other";
}

export interface PublishPayload {
  briefing: BriefingInput;
  ideas: IdeaInput[];
  /** Concepts this briefing explained (fully or as a reminder). Builds the "already learned" list. */
  concepts?: ConceptInput[];
  /** Check-ins on live ideas and open trades (ids from agent-context). */
  checks?: CheckInput[];
  /** Latest prices for held tickers, from the agent's research. Updates holdings.last_price only. */
  prices?: PriceInput[];
}

export type Validation = { ok: true; value: PublishPayload } | { ok: false; errors: string[] };

const KINDS = ["swing_morning", "swing_evening", "long_weekly"];
const TRACKS = ["swing", "long"];
const DIRECTIONS = ["long", "short"];
const INSTRUMENTS = ["stock", "option"];
const TICKER = /^[A-Z][A-Z0-9.\-]{0,11}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validatePayload(input: unknown): Validation {
  const errors: string[] = [];
  const p = input as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { ok: false, errors: ["payload must be an object"] };

  const b = p.briefing as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") errors.push("briefing is required");
  else {
    if (!KINDS.includes(b.kind as string)) errors.push(`briefing.kind must be one of ${KINDS.join(", ")}`);
    if (!str(b.date) || !DATE.test(b.date) || Number.isNaN(Date.parse(b.date))) errors.push("briefing.date must be YYYY-MM-DD");
    if (!str(b.title)) errors.push("briefing.title is required");
    if (!str(b.body_md)) errors.push("briefing.body_md is required");
    if (b.summary != null && typeof b.summary !== "string") errors.push("briefing.summary must be text");
    if (!Array.isArray(b.sources)) errors.push("briefing.sources must be a list");
    else
      b.sources.forEach((s: any, i: number) => {
        if (!s || !str(s.title) || !str(s.url) || !/^https?:\/\//.test(s.url)) errors.push(`briefing.sources[${i}] needs title and http(s) url`);
      });
  }

  if (!Array.isArray(p.ideas)) errors.push("ideas must be a list (empty is fine)");
  else {
    if (b && b.kind === "swing_evening" && p.ideas.length) errors.push("the evening recap posts no new ideas");
    p.ideas.forEach((raw: any, i: number) => {
      const at = `ideas[${i}]`;
      if (!raw || typeof raw !== "object") return errors.push(`${at} must be an object`);
      if (!TRACKS.includes(raw.track)) errors.push(`${at}.track must be swing or long`);
      if (!str(raw.ticker) || !TICKER.test(raw.ticker)) errors.push(`${at}.ticker must be uppercase, like NVDA or BRK.B`);
      if (!DIRECTIONS.includes(raw.direction)) errors.push(`${at}.direction must be long or short`);
      if (!INSTRUMENTS.includes(raw.instrument)) errors.push(`${at}.instrument must be stock or option`);
      for (const f of ["structure", "thesis", "catalyst", "invalidation", "options_angle", "entry_plan", "target"]) {
        if (!str(raw[f])) errors.push(`${at}.${f} is required`);
      }
    });
  }

  if (p.checks != null) {
    if (!Array.isArray(p.checks)) errors.push("checks must be a list");
    else
      p.checks.forEach((c: any, i: number) => {
        if (!c || !/^[0-9a-f-]{36}$/i.test(String(c.trade_id))) errors.push(`checks[${i}].trade_id must be a trade id from agent-context`);
        if (!c || !(CHECK_VERDICTS as readonly string[]).includes(c.verdict)) errors.push(`checks[${i}].verdict must be one of ${CHECK_VERDICTS.join(", ")}`);
        if (!c || !str(c.note)) errors.push(`checks[${i}].note is required`);
        if (c && c.price != null && !(typeof c.price === "number" && c.price >= 0)) errors.push(`checks[${i}].price must be a number`);
      });
  }

  if (p.concepts != null) {
    if (!Array.isArray(p.concepts)) errors.push("concepts must be a list");
    else
      p.concepts.forEach((c: any, i: number) => {
        if (!c || !str(c.term) || c.term.length > 60) errors.push(`concepts[${i}].term is required (max 60 chars)`);
        if (!c || !str(c.explanation)) errors.push(`concepts[${i}].explanation is required`);
      });
  }

  if (p.prices != null) {
    if (!Array.isArray(p.prices)) errors.push("prices must be a list");
    else
      p.prices.forEach((x: any, i: number) => {
        if (!x || !str(x.ticker) || !TICKER.test(x.ticker)) errors.push(`prices[${i}].ticker invalid`);
        if (!x || typeof x.price !== "number" || !(x.price > 0)) errors.push(`prices[${i}].price must be a positive number`);
        if (!x || !str(x.on) || !DATE.test(x.on)) errors.push(`prices[${i}].on must be YYYY-MM-DD`);
      });
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: p as unknown as PublishPayload };
}
