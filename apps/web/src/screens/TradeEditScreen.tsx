import React from "react";
import { Text } from "react-native";
import {
  computeReturnPct,
  fmtPct,
  parsePrice,
  STATUS_LABEL,
  todayIso,
  type Direction,
  type Instrument,
  type Track,
  type TradeStatus,
} from "@desk/core";
import { useData, type TradeDraft } from "../db/data";
import { Alert } from "../components/dialog";
import { Button, Card, DateInput, Field, Input, isIsoDate, NumInput, Pair, Row, Screen, SectionTitle, Segmented, Signed } from "../components/ui";
import type { JournalProps } from "../nav";
import { space, useTheme } from "../theme";

/** Every editable field as text, so half-typed numbers survive re-renders. */
interface Form {
  track: Track;
  ticker: string;
  direction: Direction;
  instrument: Instrument;
  structure: string;
  status: TradeStatus;
  thesis: string;
  catalyst: string;
  catalyst_type: string;
  invalidation: string;
  options_angle: string;
  entry_plan: string;
  target: string;
  entry_price: string;
  exit_price: string;
  opened_on: string;
  closed_on: string;
  return_pct: string;
  lesson: string;
}

const t2s = (v: string | number | null | undefined) => (v == null ? "" : String(v));

export function TradeEditScreen({ navigation, route }: JournalProps<"TradeEdit">) {
  const { c, font } = useTheme();
  const { trades, briefings, saveTrade, deleteTrade } = useData();
  const id = route.params?.tradeId;
  const existing = id ? trades.find((t) => t.id === id) : undefined;
  const source = existing?.source_briefing_id ? briefings.find((b) => b.id === existing.source_briefing_id) : undefined;

  const [f, setF] = React.useState<Form>(() => ({
    track: existing?.track ?? route.params?.track ?? "swing",
    ticker: existing?.ticker ?? "",
    direction: existing?.direction ?? "long",
    instrument: existing?.instrument ?? "stock",
    structure: existing?.structure ?? "Shares",
    status: existing?.status ?? "open",
    thesis: t2s(existing?.thesis),
    catalyst: t2s(existing?.catalyst),
    catalyst_type: t2s(existing?.catalyst_type),
    invalidation: t2s(existing?.invalidation),
    options_angle: t2s(existing?.options_angle),
    entry_plan: t2s(existing?.entry_plan),
    target: t2s(existing?.target),
    entry_price: t2s(existing?.entry_price),
    exit_price: t2s(existing?.exit_price),
    opened_on: existing?.opened_on ?? (existing ? "" : todayIso()),
    closed_on: t2s(existing?.closed_on),
    return_pct: t2s(existing?.return_pct),
    lesson: t2s(existing?.lesson),
  }));
  const [busy, setBusy] = React.useState(false);
  const [showIdea, setShowIdea] = React.useState(!existing || !existing.source_briefing_id);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  /** Status taps fill in today's date where it's obviously wanted. */
  function setStatus(s: TradeStatus) {
    setF((p) => ({
      ...p,
      status: s,
      opened_on: (s === "open" || s === "closed") && !p.opened_on ? todayIso() : p.opened_on,
      closed_on: s === "closed" && !p.closed_on ? todayIso() : p.closed_on,
    }));
  }

  if (id && !existing) {
    return (
      <Screen>
        <Text style={font.body}>That entry isn't here any more.</Text>
      </Screen>
    );
  }

  const entry = parsePrice(f.entry_price);
  const exit = parsePrice(f.exit_price);
  const computed = computeReturnPct(entry, exit, f.direction, f.instrument);
  const typedReturn = f.return_pct.trim() ? Number(f.return_pct.replace(/[%+\s]/g, "").replace("−", "-")) : null;

  function problems(): string[] {
    const out: string[] = [];
    const tk = f.ticker.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(tk)) out.push("Ticker looks wrong (letters, like NVDA or BRK.B).");
    if (f.entry_price.trim() && entry == null) out.push("Entry price isn't a number.");
    if (f.exit_price.trim() && exit == null) out.push("Exit price isn't a number.");
    if (typedReturn != null && !Number.isFinite(typedReturn)) out.push("Return % isn't a number.");
    for (const [k, label] of [["opened_on", "Opened"], ["closed_on", "Closed"]] as const) {
      if (f[k].trim() && !isIsoDate(f[k].trim())) out.push(`${label} date should be YYYY-MM-DD.`);
    }
    return out;
  }

  async function save() {
    const errs = problems();
    if (errs.length) {
      Alert.alert("Check these", errs.join("\n"));
      return;
    }
    const txt = (v: string) => (v.trim() ? v.trim() : null);
    const draft: TradeDraft = {
      track: f.track,
      ticker: f.ticker.trim().toUpperCase(),
      direction: f.direction,
      instrument: f.instrument,
      structure: f.structure.trim() || (f.instrument === "stock" ? "Shares" : "Option"),
      status: f.status,
      thesis: txt(f.thesis),
      catalyst: txt(f.catalyst),
      catalyst_type: txt(f.catalyst_type),
      invalidation: txt(f.invalidation),
      options_angle: txt(f.options_angle),
      entry_plan: txt(f.entry_plan),
      target: txt(f.target),
      entry_price: entry,
      exit_price: exit,
      opened_on: txt(f.opened_on),
      closed_on: txt(f.closed_on),
      // A typed return wins (e.g. an options spread with fees); otherwise use the fills.
      return_pct: typedReturn ?? (f.status === "closed" ? computed : null),
      lesson: txt(f.lesson),
      source_briefing_id: existing?.source_briefing_id ?? null,
    };
    setBusy(true);
    try {
      await saveTrade(draft, id);
      navigation.goBack();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert("Delete this entry?", "Passing on an idea keeps the journal honest; delete only mistakes.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteTrade(id)
            .then(() => navigation.goBack())
            .catch((e) => Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e)));
        },
      },
    ]);
  }

  const statuses: TradeStatus[] = ["idea", "open", "closed", "passed"];

  return (
    <Screen>
      {existing ? (
        <Row style={{ marginBottom: space.sm, justifyContent: "flex-start" }}>
          <Text style={[font.title]}>{existing.ticker}</Text>
          <Text style={font.dim}>{existing.structure}</Text>
        </Row>
      ) : null}
      {source ? (
        <Text
          style={[font.small, { marginBottom: space.md, color: c.accent }]}
          onPress={() => navigation.getParent()?.navigate("BriefingsTab", { screen: "BriefingDetail", params: { briefingId: source.id } })}
        >
          From briefing: {source.title} ({source.date}) ›
        </Text>
      ) : null}

      <SectionTitle>Status</SectionTitle>
      <Segmented<TradeStatus> value={f.status} onChange={setStatus} options={statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />

      <SectionTitle>Your trade</SectionTitle>
      <Card>
        {!existing || !existing.source_briefing_id ? (
          <>
            <Pair>
              <Field label="Ticker">
                <Input value={f.ticker} onChangeText={(v) => set("ticker")(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="NVDA" />
              </Field>
              <Field label="Track">
                <Segmented<Track> value={f.track} onChange={set("track")} options={[{ value: "swing", label: "Swing" }, { value: "long", label: "Long-term" }]} />
              </Field>
            </Pair>
            <Pair>
              <Field label="Direction">
                <Segmented<Direction> value={f.direction} onChange={set("direction")} options={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]} />
              </Field>
              <Field label="Instrument">
                <Segmented<Instrument>
                  value={f.instrument}
                  onChange={(v) => setF((p) => ({ ...p, instrument: v, structure: v === "stock" && !p.structure.trim() ? "Shares" : p.structure }))}
                  options={[{ value: "stock", label: "Stock" }, { value: "option", label: "Option" }]}
                />
              </Field>
            </Pair>
          </>
        ) : null}
        <Field label="Structure" hint={f.instrument === "option" ? "e.g. Nov 21 150/160 call spread" : undefined}>
          <Input value={f.structure} onChangeText={set("structure")} />
        </Field>
        <Pair>
          <Field label={f.instrument === "option" ? "Entry (premium)" : "Entry price"}>
            <NumInput value={f.entry_price} onChangeText={set("entry_price")} placeholder="0.00" />
          </Field>
          <Field label={f.instrument === "option" ? "Exit (premium)" : "Exit price"}>
            <NumInput value={f.exit_price} onChangeText={set("exit_price")} placeholder="0.00" />
          </Field>
        </Pair>
        <Pair>
          <Field label="Opened">
            <DateInput value={f.opened_on} onChange={set("opened_on")} />
          </Field>
          <Field label="Closed">
            <DateInput value={f.closed_on} onChange={set("closed_on")} />
          </Field>
        </Pair>
        <Field label="Return %" hint={computed != null ? `From your fills: ${fmtPct(computed, 2)}. Leave blank to use that.` : "Filled in from entry and exit when you close."}>
          <NumInput value={f.return_pct} onChangeText={set("return_pct")} placeholder={computed != null ? computed.toFixed(2) : ""} />
        </Field>
        {f.status === "closed" && (typedReturn ?? computed) != null ? (
          <Row style={{ marginBottom: space.md }}>
            <Text style={font.dim}>Result</Text>
            <Signed value={typedReturn ?? computed} text={fmtPct(typedReturn ?? computed, 2)} style={{ fontSize: 20 }} />
          </Row>
        ) : null}
        <Field label="Lesson" hint="What would you do differently? What did the market teach you?">
          <Input value={f.lesson} onChangeText={set("lesson")} multiline />
        </Field>
      </Card>

      <SectionTitle right={existing?.source_briefing_id ? <Button title={showIdea ? "Hide" : "Show"} kind="ghost" onPress={() => setShowIdea((v) => !v)} /> : undefined}>
        The idea
      </SectionTitle>
      {existing?.invalidation && !showIdea ? (
        <Card style={{ backgroundColor: c.warnSoft, borderColor: c.warnSoft }}>
          <Text style={[font.small, { color: c.warn, fontWeight: "700" }]}>WRONG IF</Text>
          <Text style={[font.body, { marginTop: 2 }]}>{existing.invalidation}</Text>
        </Card>
      ) : null}
      {showIdea ? (
        <Card>
          <Field label="Thesis">
            <Input value={f.thesis} onChangeText={set("thesis")} multiline />
          </Field>
          <Pair>
            <Field label="Catalyst">
              <Input value={f.catalyst} onChangeText={set("catalyst")} multiline />
            </Field>
            <Field label="Catalyst type" hint="earnings, macro, news, sector…">
              <Input value={f.catalyst_type} onChangeText={set("catalyst_type")} autoCapitalize="none" />
            </Field>
          </Pair>
          <Field label="Wrong if (invalidation)">
            <Input value={f.invalidation} onChangeText={set("invalidation")} multiline />
          </Field>
          <Pair>
            <Field label="Entry plan">
              <Input value={f.entry_plan} onChangeText={set("entry_plan")} multiline />
            </Field>
            <Field label="Target">
              <Input value={f.target} onChangeText={set("target")} multiline />
            </Field>
          </Pair>
          <Field label="Options angle">
            <Input value={f.options_angle} onChangeText={set("options_angle")} multiline />
          </Field>
        </Card>
      ) : null}

      <Row style={{ marginTop: space.sm }}>
        <Button title="Cancel" kind="ghost" onPress={() => navigation.goBack()} />
        <Row>
          {id ? <Button title="Delete" kind="danger" onPress={remove} /> : null}
          <Button title="Save" onPress={() => void save()} busy={busy} disabled={!f.ticker.trim()} />
        </Row>
      </Row>
    </Screen>
  );
}
