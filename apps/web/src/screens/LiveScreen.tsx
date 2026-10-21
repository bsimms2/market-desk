import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { accountTotals, BOT_KIND_LABEL, BOT_PROFILES, daysBetween, fmtPct, fmtPrice, isBearish, scorecard, todayIso, type ScoreFilter } from "@desk/core";
import { accountView, useBot, type BotData, type BotDecision, type BotOrder, type BotPosition } from "../db/bot";
import type { LiveQuote } from "../db/quotes";
import { Button, Card, Empty, Pill, Row, Screen, SectionTitle, Segmented, Signed, Stat } from "../components/ui";
import { Alert } from "../components/dialog";
import { radius, space, useTheme } from "../theme";
import { fmtDate } from "./BriefingsScreen";

const signedMoney = (n: number | null | undefined) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + fmtPrice(Math.abs(n)));
const mult = (p: BotPosition) => (p.kind === "stock" ? 1 : 100);
const nyTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/** "Nov 20 220/230 call spread" from "NVDA:2026-11-20:220/230C". */
function specLabel(p: Pick<BotPosition, "spec" | "qty">): string {
  if (!p.spec) return `${p.qty} ${p.qty === 1 ? "share" : "shares"}`;
  const [, exp, strikes] = p.spec.split(":");
  const d = new Date(exp + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const k = strikes!.slice(0, -1);
  const type = strikes!.endsWith("C") ? "call" : "put";
  return `${p.qty}× ${d} ${k} ${type}${k.includes("/") ? " spread" : ""}`;
}

/** Per-share value now: stocks from the live quote, options from the checker's latest mark (CBOE, ~15 min delayed). */
function valueNow(p: BotPosition, q: LiveQuote | undefined): { value: number; live: boolean } {
  if (p.kind === "stock" && q?.price != null) return { value: q.price, live: true };
  return { value: p.mark ?? p.entry_price, live: false };
}

const VERDICT: Record<BotDecision["verdict"], { label: string; tone: "good" | "neutral" | "warn" | "bad" }> = {
  take: { label: "Took it", tone: "good" },
  skip: { label: "Skipped", tone: "neutral" },
  wait: { label: "Waiting", tone: "warn" },
  rejected: { label: "Rules said no", tone: "bad" },
  order: { label: "Resting order", tone: "warn" },
  cancel: { label: "Cancelled order", tone: "neutral" },
};

const ORDER_STATUS: Record<BotOrder["status"], { label: string; tone: "good" | "neutral" | "warn" | "bad" }> = {
  pending: { label: "Waiting", tone: "warn" },
  filled: { label: "Filled", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  rejected: { label: "Refused at trigger", tone: "bad" },
};

const EXIT_LABEL: Record<NonNullable<BotPosition["exit_reason"]>, string> = {
  stop: "Hit stop",
  target: "Hit target",
  time: "Time ran out",
  agent: "Agent closed",
  expiry: "Expired",
};

/** Live value of one account: stock positions at the live quote, options at the checker's latest mark. */
function liveTotals(v: BotData, quotes: Map<string, LiveQuote>) {
  const live = v.positions.map((p) => (p.status === "open" ? { ...p, mark: valueNow(p, quotes.get(p.ticker)).value } : p));
  const tot = accountTotals(v.account.starting_cash, live);
  const spy = quotes.get("SPY")?.price;
  const spyPct = v.account.spy_start && spy ? ((spy - v.account.spy_start) / v.account.spy_start) * 100 : null;
  return { ...tot, spyPct, edge: spyPct == null ? null : tot.returnPct - spyPct };
}

const ACCOUNT_BLURB: Record<string, string> = {
  steady: "Filters the research desk's ideas. Limits: 20% per stock, 6% per option, 6 positions, pauses at −25%.",
  aggressive: "Finds its own trades. No size limits, cash only, stock and long calls/puts. Runs 9:45, 12:30 and 3:15 ET.",
};

/** The paper bots' dashboard: both accounts vs SPY, then one account's positions, orders, decisions and scorecard. */
export function LiveScreen() {
  const { c, font } = useTheme();
  const { data, quotes, quotedAt, error, resume } = useBot();
  const [filter, setFilter] = React.useState<ScoreFilter>("all");
  const [accountId, setAccountId] = React.useState(1);
  const [resuming, setResuming] = React.useState(false);

  if (!data) {
    return (
      <Screen>
        {error ? <Empty title="Couldn't load the paper account" hint={error} /> : <ActivityIndicator color={c.accent} style={{ marginTop: space.xl }} />}
      </Screen>
    );
  }

  const views = data.accounts.map((a) => accountView(data, a.id)!);
  const view = views.find((v) => v.account.id === accountId) ?? views[0];
  if (!view) return <Screen><Empty title="No paper accounts" /></Screen>;
  const { account, positions, decisions, marks, orders } = view;
  const profile = BOT_PROFILES[account.profile];
  const hasSpreads = positions.some((p) => p.kind === "call_spread" || p.kind === "put_spread");
  const pending = orders.filter((o) => o.status === "pending");
  const lately = orders.filter((o) => o.status !== "pending" && o.status !== "filled").slice(0, 5);
  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status === "closed");
  const tot = liveTotals(view, quotes);
  const { spyPct, edge } = tot;
  const session = quotes.get("SPY")?.session;
  const latestDay = decisions[0]?.date;
  const latest = decisions.filter((d) => d.date === latestDay);
  const sc = scorecard(positions, filter);

  const onResume = () =>
    Alert.alert("Resume the paper bot?", "The kill switch paused new trades. Resuming lets the trader agent open positions again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Resume",
        onPress: () => {
          setResuming(true);
          resume(account.id)
            .catch((e) => Alert.alert("Couldn't resume", e instanceof Error ? e.message : String(e)))
            .finally(() => setResuming(false));
        },
      },
    ]);

  return (
    <Screen>
      <Row style={{ marginBottom: space.sm }}>
        <Pill label="Paper money" tone="accent" />
        <Text style={font.small}>
          {session === "regular" ? "● Market open" : session === "pre" ? "Pre-market" : session === "post" ? "After hours" : "Market closed"}
          {quotedAt ? ` · ${new Date(quotedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}
        </Text>
      </Row>

      {views.length > 1 ? (
        <Card>
          <Row>
            <Text style={[font.small, { flex: 1 }]}>Since each bot's first trade</Text>
            <Text style={[font.small, { width: 92, textAlign: "right" }]}>Value</Text>
            <Text style={[font.small, { width: 64, textAlign: "right" }]}>Return</Text>
            <Text style={[font.small, { width: 64, textAlign: "right" }]}>SPY</Text>
          </Row>
          {views.map((v) => {
            const t = liveTotals(v, quotes);
            return (
              <Pressable key={v.account.id} onPress={() => setAccountId(v.account.id)}>
                <Row style={{ marginTop: space.sm }}>
                  <Text style={[font.h2, { flex: 1, color: v.account.id === account.id ? c.accent : c.text }]}>{v.account.name}</Text>
                  <Text style={[font.num, { width: 92, textAlign: "right", fontSize: 15 }]}>{fmtPrice(t.equity)}</Text>
                  <Signed value={t.returnPct} text={fmtPct(t.returnPct)} style={{ width: 64, textAlign: "right", fontSize: 15 }} />
                  <Signed value={t.spyPct} text={v.account.started_on ? fmtPct(t.spyPct) : "—"} style={{ width: 64, textAlign: "right", fontSize: 15 }} />
                </Row>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Segmented<string>
        value={String(account.id)}
        onChange={(v) => {
          setAccountId(Number(v));
          setFilter("all");
        }}
        options={views.map((v) => ({ value: String(v.account.id), label: v.account.name }))}
      />
      <Row style={{ marginTop: space.sm, marginBottom: space.sm, alignItems: "flex-start" }}>
        <Text style={[font.small, { flex: 1 }]}>{ACCOUNT_BLURB[account.slug] ?? ""}</Text>
        <Pill label={account.status === "active" ? "Trading" : "Paused"} tone={account.status === "active" ? "good" : "bad"} />
      </Row>

      {account.status === "paused" ? (
        <Card style={{ borderColor: c.bad }}>
          <Text style={[font.h2, { color: c.bad }]}>Kill switch: trading paused</Text>
          <Text style={[font.body, { marginTop: space.xs }]}>{account.paused_reason}</Text>
          <Button title="Resume trading" kind="danger" busy={resuming} onPress={onResume} style={{ marginTop: space.md }} />
        </Card>
      ) : null}

      <Card>
        <Row>
          <View>
            <Text style={font.small}>Account value</Text>
            <Text style={font.big}>{fmtPrice(tot.equity)}</Text>
            <Signed value={tot.equity - account.starting_cash} text={`${signedMoney(tot.equity - account.starting_cash)} (${fmtPct(tot.returnPct, 2)})`} />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={font.small}>S&P 500 (SPY) same period</Text>
            <Signed value={spyPct} text={fmtPct(spyPct, 2)} style={{ fontSize: 20 }} />
            {edge != null ? (
              <Text style={[font.small, { color: edge >= 0 ? c.good : c.bad, fontWeight: "700" }]}>
                {edge >= 0 ? "Ahead of" : "Behind"} SPY by {Math.abs(edge).toFixed(2)} pts
              </Text>
            ) : null}
          </View>
        </Row>
        <Text style={[font.small, { marginTop: space.sm }]}>
          {account.started_on ? `Since the first trade on ${fmtDate(account.started_on)}.` : "The clock starts with the agent's first trade."} Cash {fmtPrice(tot.cash)} · in
          positions {fmtPrice(tot.openValue)} · realized {signedMoney(tot.realized)}
        </Text>
      </Card>

      <SectionTitle right={<Text style={font.small}>{profile.maxOpen != null ? `${open.length} of ${profile.maxOpen}` : `${open.length} open`}</Text>}>Open positions</SectionTitle>
      {open.length === 0 ? (
        <Card>
          <Text style={font.dim}>
            {account.slug === "aggressive"
              ? "Nothing open. The aggressive bot scans the market at 9:45 AM, 12:30 PM and 3:15 PM ET."
              : "Nothing open. The steady bot looks at the research desk's ideas at 10:00 AM and 2:30 PM ET."}
          </Text>
        </Card>
      ) : (
        open.map((p) => <PositionCard key={p.id} p={p} q={quotes.get(p.ticker)} />)
      )}

      <SectionTitle right={<Text style={font.small}>checked every 10 min</Text>}>Waiting to buy</SectionTitle>
      {pending.length === 0 ? (
        <Card>
          <Text style={font.dim}>No resting orders. When the agent likes an idea but not the price, it leaves an order that fills when the stock gets there.</Text>
        </Card>
      ) : (
        pending.map((o) => <OrderCard key={o.id} o={o} q={quotes.get(o.ticker)} />)
      )}
      {lately.map((o) => (
        <OrderCard key={o.id} o={o} q={undefined} />
      ))}

      <SectionTitle right={latestDay ? <Text style={font.small}>{fmtDate(latestDay)}</Text> : undefined}>Latest decisions</SectionTitle>
      {latest.length === 0 ? (
        <Card>
          <Text style={font.dim}>No decisions yet. Every trade, resting order and skip comes with the agent's reasoning.</Text>
        </Card>
      ) : (
        latest.map((d) => <DecisionCard key={d.id} d={d} />)
      )}

      <SectionTitle>Scorecard</SectionTitle>
      <Segmented<ScoreFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All trades" },
          { value: "live", label: "Fits live account" },
          ...(hasSpreads ? [{ value: "spreads" as const, label: "Spreads (old)" }] : []),
        ]}
      />
      <Text style={[font.small, { marginVertical: space.sm }]}>
        {filter === "all"
          ? "Every closed paper trade."
          : filter === "live"
            ? `Only trades the $${account.live_pot.toLocaleString()} live account could have made (size limits, no spreads): roughly what real money would have done.`
            : "The few debit spreads the steady bot took before spreads were switched off."}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Stat label="Closed" value={String(sc.closed)} sub={`${sc.wins} won`} />
        <Stat label="Win rate" value={sc.winRate == null ? "—" : `${sc.winRate}%`} />
        <Stat label="Total P/L" value={signedMoney(sc.closed ? sc.totalPnl : null)} tone={sc.totalPnl} />
        <Stat label="Avg win · avg loss" value={`${fmtPct(sc.avgWinPct, 0)} · ${fmtPct(sc.avgLossPct, 0)}`} sub="% of the money put in" />
      </View>

      {marks.length ? (
        <>
          <SectionTitle>Day by day</SectionTitle>
          <Card>
            <Row>
              <Text style={[font.small, { flex: 1 }]}>Close</Text>
              <Text style={[font.small, { width: 96, textAlign: "right" }]}>Account</Text>
              <Text style={[font.small, { width: 72, textAlign: "right" }]}>Paper</Text>
              <Text style={[font.small, { width: 72, textAlign: "right" }]}>SPY</Text>
            </Row>
            {[...marks].reverse().slice(0, 15).map((m) => {
              const mine = ((m.equity - account.starting_cash) / account.starting_cash) * 100;
              const theirs = account.spy_start && m.spy ? ((m.spy - account.spy_start) / account.spy_start) * 100 : null;
              return (
                <Row key={m.date} style={{ marginTop: space.xs }}>
                  <Text style={[font.dim, { flex: 1 }]}>{fmtDate(m.date)}</Text>
                  <Text style={[font.num, { width: 96, textAlign: "right", fontSize: 14 }]}>{fmtPrice(m.equity)}</Text>
                  <Signed value={mine} text={fmtPct(mine)} style={{ width: 72, textAlign: "right", fontSize: 14 }} />
                  <Signed value={theirs} text={fmtPct(theirs)} style={{ width: 72, textAlign: "right", fontSize: 14 }} />
                </Row>
              );
            })}
          </Card>
        </>
      ) : null}

      <SectionTitle>Closed trades</SectionTitle>
      {closed.length === 0 ? (
        <Card>
          <Text style={font.dim}>None yet.</Text>
        </Card>
      ) : (
        closed.map((p) => <ClosedCard key={p.id} p={p} />)
      )}

      <Text style={[font.small, { marginTop: space.lg, textAlign: "center" }]}>
        Simulated money. Stock prices are live; option values come from CBOE's ~15-minute-delayed chain and update every 10 minutes. Fills: buys at the ask, sells at the bid.
      </Text>
    </Screen>
  );
}

function PositionCard({ p, q }: { p: BotPosition; q: LiveQuote | undefined }) {
  const { c, font } = useTheme();
  const [open, setOpen] = React.useState(false);
  const { value, live } = valueNow(p, q);
  const pnl = (value - p.entry_price) * p.qty * mult(p);
  const pct = (pnl / p.cost) * 100;
  const u = q?.price ?? p.mark_underlying ?? p.entry_underlying;
  const held = daysBetween(p.created_at.slice(0, 10), todayIso());
  return (
    <Pressable onPress={() => setOpen((o) => !o)}>
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={font.ticker}>
              {p.ticker}{" "}
              <Text style={[font.dim, { color: isBearish(p.kind) ? c.bad : c.good, fontWeight: "700" }]}>{isBearish(p.kind) ? "▼" : "▲"} {BOT_KIND_LABEL[p.kind]}</Text>
            </Text>
            <Text style={font.small}>{specLabel(p)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Signed value={pnl} text={signedMoney(pnl)} style={{ fontSize: 18 }} />
            <Signed value={pct} text={fmtPct(pct)} style={{ fontSize: 13 }} />
          </View>
        </Row>

        <Row style={{ marginTop: space.sm }}>
          <Text style={font.small}>
            {p.ticker} {fmtPrice(u)}
            {q?.day_pct != null ? ` (${fmtPct(q.day_pct)} today)` : ""}
          </Text>
          <Text style={font.small}>
            {live ? "Live" : p.marked_at ? `Value as of ${nyTime(p.marked_at)} ET` : ""}
          </Text>
        </Row>
        <RangeBar stop={p.stop} target={p.target} entry={p.entry_underlying} now={u} />

        <Row style={{ marginTop: space.sm, justifyContent: "flex-start", flexWrap: "wrap" }}>
          <Pill label={`Day ${held}`} />
          <Pill label={`Exit by ${fmtDate(p.exit_by)}`} />
          <Pill label={`In ${fmtPrice(p.cost)}`} />
          <Pill label={p.fits_live && p.live_eligible ? "Fits live account" : "Paper only"} tone={p.fits_live && p.live_eligible ? "good" : "neutral"} />
        </Row>
        {open ? (
          <Text style={[font.body, { marginTop: space.sm }]}>{p.reasoning}</Text>
        ) : (
          <Text style={[font.small, { marginTop: space.sm, color: c.accent }]}>Why it took this ›</Text>
        )}
      </Card>
    </Pressable>
  );
}

/** Where the stock sits between the stop (left) and the target (right), with the entry marked. */
function RangeBar({ stop, target, entry, now }: { stop: number; target: number; entry: number; now: number }) {
  const { c, font } = useTheme();
  const at = (x: number) => Math.min(1, Math.max(0, (x - stop) / (target - stop)));
  const t = at(now);
  const e = at(entry);
  const winning = t >= e;
  return (
    <View style={{ marginTop: space.sm }}>
      <View style={{ height: 10, borderRadius: radius.sm, backgroundColor: c.cardAlt, overflow: "visible", justifyContent: "center" }}>
        <View
          style={{
            position: "absolute",
            left: `${Math.min(t, e) * 100}%`,
            width: `${Math.abs(t - e) * 100}%`,
            height: 10,
            backgroundColor: winning ? c.goodSoft : c.badSoft,
          }}
        />
        <View style={{ position: "absolute", left: `${e * 100}%`, width: 2, height: 16, marginLeft: -1, backgroundColor: c.textDim }} />
        <View
          style={{
            position: "absolute",
            left: `${t * 100}%`,
            width: 14,
            height: 14,
            marginLeft: -7,
            borderRadius: 7,
            backgroundColor: winning ? c.good : c.bad,
            borderWidth: 2,
            borderColor: c.card,
          }}
        />
      </View>
      <Row style={{ marginTop: 4 }}>
        <Text style={[font.small, { color: c.bad }]}>Stop {fmtPrice(stop)}</Text>
        <Text style={font.small}>Entry {fmtPrice(entry)}</Text>
        <Text style={[font.small, { color: c.good }]}>Target {fmtPrice(target)}</Text>
      </Row>
    </View>
  );
}

function DecisionCard({ d }: { d: BotDecision }) {
  const { font } = useTheme();
  const [open, setOpen] = React.useState(false);
  const v = VERDICT[d.verdict];
  return (
    <Pressable onPress={() => setOpen((o) => !o)}>
      <Card>
        <Row>
          <Text style={font.ticker}>{d.ticker}</Text>
          <Row style={{ justifyContent: "flex-end" }}>
            <Text style={font.small}>{nyTime(d.created_at)} ET</Text>
            <Pill label={v.label} tone={v.tone} />
          </Row>
        </Row>
        <Text style={[font.body, { marginTop: space.xs }]} numberOfLines={open ? undefined : 3}>
          {d.reasoning}
        </Text>
      </Card>
    </Pressable>
  );
}

function ClosedCard({ p }: { p: BotPosition }) {
  const { font } = useTheme();
  const [open, setOpen] = React.useState(false);
  const pct = p.pnl != null && p.cost > 0 ? (p.pnl / p.cost) * 100 : null;
  return (
    <Pressable onPress={() => setOpen((o) => !o)}>
      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={font.ticker}>
              {p.ticker} <Text style={font.dim}>{BOT_KIND_LABEL[p.kind]}</Text>
            </Text>
            <Text style={font.small}>
              {specLabel(p)} · {fmtDate(p.created_at.slice(0, 10))} → {p.closed_at ? fmtDate(p.closed_at.slice(0, 10)) : "—"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Signed value={p.pnl} text={signedMoney(p.pnl)} />
            <Signed value={pct} text={fmtPct(pct)} style={{ fontSize: 13 }} />
          </View>
        </Row>
        <Row style={{ marginTop: space.sm, justifyContent: "flex-start", flexWrap: "wrap" }}>
          {p.exit_reason ? <Pill label={EXIT_LABEL[p.exit_reason]} tone={p.exit_reason === "target" ? "good" : p.exit_reason === "stop" ? "bad" : "neutral"} /> : null}
          <Pill label={p.fits_live && p.live_eligible ? "Fits live account" : "Paper only"} />
        </Row>
        {open ? (
          <>
            {p.exit_note ? <Text style={[font.dim, { marginTop: space.sm }]}>Exit: {p.exit_note}</Text> : null}
            <Text style={[font.body, { marginTop: space.sm }]}>{p.reasoning}</Text>
          </>
        ) : null}
      </Card>
    </Pressable>
  );
}

function OrderCard({ o, q }: { o: BotOrder; q: LiveQuote | undefined }) {
  const { c, font } = useTheme();
  const [open, setOpen] = React.useState(false);
  const st = ORDER_STATUS[o.status];
  const below = o.trigger_type === "at_or_below";
  const away = q?.price != null ? ((o.trigger_price - q.price) / q.price) * 100 : null;
  return (
    <Pressable onPress={() => setOpen((v) => !v)}>
      <Card style={o.status === "pending" ? undefined : { opacity: 0.75 }}>
        <Row>
          <View style={{ flex: 1 }}>
            <Text style={font.ticker}>
              {o.ticker}{" "}
              <Text style={[font.dim, { color: isBearish(o.kind) ? c.bad : c.good, fontWeight: "700" }]}>{isBearish(o.kind) ? "▼" : "▲"} {BOT_KIND_LABEL[o.kind]}</Text>
            </Text>
            <Text style={font.small}>{specLabel(o)}</Text>
          </View>
          <Pill label={st.label} tone={st.tone} />
        </Row>
        <Text style={[font.body, { marginTop: space.sm }]}>
          Buys if {o.ticker} trades {below ? "at or below" : "at or above"} <Text style={{ fontWeight: "700" }}>{fmtPrice(o.trigger_price)}</Text>
          {o.max_price != null ? `, paying at most ${fmtPrice(o.max_price)}/share` : ""}
        </Text>
        {o.status === "pending" ? (
          <Text style={[font.small, { marginTop: 2 }]}>
            {q?.price != null ? `Now ${fmtPrice(q.price)}, ${Math.abs(away!).toFixed(1)}% ${away! < 0 ? "below" : "above"} here · ` : ""}good until {fmtDate(o.good_until)}
          </Text>
        ) : o.note ? (
          <Text style={[font.small, { marginTop: 2 }]}>{o.note}</Text>
        ) : null}
        <Text style={[font.small, { marginTop: 2 }]}>
          Then: stop {fmtPrice(o.stop)}, target {fmtPrice(o.target)}, exit by {fmtDate(o.exit_by)}
        </Text>
        {open ? <Text style={[font.body, { marginTop: space.sm }]}>{o.reasoning}</Text> : <Text style={[font.small, { marginTop: space.sm, color: c.accent }]}>Why ›</Text>}
      </Card>
    </Pressable>
  );
}
