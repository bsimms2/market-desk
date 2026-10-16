import React from "react";
import { Text, View } from "react-native";
import { daysHeld, effectiveReturn, fmtPct, fmtPrice, STATUS_LABEL, type Track, type Trade, type TradeStatus } from "@desk/core";
import { useData } from "../db/data";
import { Button, Empty, Pill, PressCard, Row, Screen, Segmented, Signed } from "../components/ui";
import { LatestCheck } from "../components/CheckBadge";
import type { JournalProps } from "../nav";
import { space, useTheme } from "../theme";

type Filter = "all" | TradeStatus;

const STATUS_TONE = { idea: "accent", open: "warn", closed: "neutral", passed: "neutral" } as const;

export function JournalScreen({ navigation }: JournalProps<"JournalList">) {
  const { trades } = useData();
  const [track, setTrack] = React.useState<Track>("swing");
  const [filter, setFilter] = React.useState<Filter>("all");

  const mine = trades.filter((t) => t.track === track);
  const count = (f: Filter) => (f === "all" ? mine.length : mine.filter((t) => t.status === f).length);
  const shown = filter === "all" ? mine : mine.filter((t) => t.status === filter);

  const filters: Filter[] = ["all", "idea", "open", "closed", "passed"];

  return (
    <Screen>
      <Row style={{ marginBottom: space.md, flexWrap: "wrap" }}>
        <Segmented<Track>
          value={track}
          onChange={setTrack}
          options={[
            { value: "swing", label: "Swing" },
            { value: "long", label: "Long-term" },
          ]}
        />
        <Button title="+ Add entry" kind="secondary" onPress={() => navigation.navigate("TradeEdit", { track })} />
      </Row>
      <View style={{ marginBottom: space.md }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={filters.map((f) => ({ value: f, label: `${f === "all" ? "All" : STATUS_LABEL[f]} ${count(f)}` }))}
        />
      </View>
      {shown.length === 0 ? (
        <Empty
          title={mine.length ? "Nothing with that status" : "No entries yet"}
          hint={mine.length ? undefined : "The agent's ideas land here as “Idea”. Tap + Add entry for one you found yourself."}
        />
      ) : (
        shown.map((t) => <TradeRow key={t.id} t={t} onPress={() => navigation.navigate("TradeEdit", { tradeId: t.id })} />)
      )}
    </Screen>
  );
}

function TradeRow({ t, onPress }: { t: Trade; onPress: () => void }) {
  const { c, font } = useTheme();
  const ret = t.status === "closed" ? effectiveReturn(t) : null;
  const held = daysHeld(t);
  return (
    <PressCard onPress={onPress}>
      <Row>
        <Row style={{ flexShrink: 1, justifyContent: "flex-start" }}>
          <Text style={font.ticker}>{t.ticker}</Text>
          <Text style={[font.dim, { color: t.direction === "long" ? c.good : c.bad, fontWeight: "700" }]}>
            {t.direction === "long" ? "▲ Long" : "▼ Short"}
          </Text>
          <Pill label={t.instrument === "option" ? "Option" : "Stock"} />
        </Row>
        <Pill label={STATUS_LABEL[t.status]} tone={STATUS_TONE[t.status]} />
      </Row>
      <Text style={[font.dim, { marginTop: space.xs }]} numberOfLines={1}>
        {t.structure}
      </Text>
      {t.status === "closed" ? (
        <Row style={{ marginTop: space.sm }}>
          <Text style={font.small}>
            {fmtPrice(t.entry_price)} → {fmtPrice(t.exit_price)}
            {held != null ? ` · ${held}d` : ""}
          </Text>
          <Signed value={ret} text={fmtPct(ret)} />
        </Row>
      ) : t.status === "open" ? (
        <>
          <Text style={[font.small, { marginTop: space.sm }]}>
            In at {fmtPrice(t.entry_price)}
            {held != null ? ` · held ${held} day${held === 1 ? "" : "s"}` : ""}
          </Text>
          {t.invalidation ? (
            <Text style={[font.small, { marginTop: 2, color: c.warn }]} numberOfLines={2}>
              Wrong if: {t.invalidation}
            </Text>
          ) : null}
        </>
      ) : t.thesis ? (
        <Text style={[font.small, { marginTop: space.sm }]} numberOfLines={2}>
          {t.thesis}
        </Text>
      ) : null}
      {t.status === "idea" || t.status === "open" ? <LatestCheck tradeId={t.id} /> : null}
      <Text style={[font.small, { marginTop: space.xs }]}>Logged {t.created_at.slice(0, 10)}</Text>
    </PressCard>
  );
}
