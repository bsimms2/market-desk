import React from "react";
import { Text, View } from "react-native";
import { VERDICT_LABEL, type CheckVerdict, type TradeCheck } from "@desk/core";
import { useData } from "../db/data";
import { Pill } from "./ui";
import { space, useTheme } from "../theme";

const TONE: Record<CheckVerdict, "good" | "warn" | "bad" | "accent" | "neutral"> = {
  on_track: "good",
  at_risk: "warn",
  invalidated: "bad",
  target_hit: "accent",
  entry_missed: "neutral",
  stale: "neutral",
};
const ICON: Record<CheckVerdict, string> = { on_track: "✓", at_risk: "⚠", invalidated: "✕", target_hit: "◎", entry_missed: "»", stale: "…" };

/** The agent's latest check-in on a trade, or null when it hasn't been checked yet. */
export function useLatestCheck(tradeId: string): TradeCheck | undefined {
  const { checks } = useData();
  return checks.find((c) => c.trade_id === tradeId);
}

export function VerdictPill({ verdict }: { verdict: CheckVerdict }) {
  return <Pill label={`${ICON[verdict]} ${VERDICT_LABEL[verdict]}`} tone={TONE[verdict]} />;
}

/** Latest check-in, compact: verdict pill, date and the agent's one-line note. */
export function LatestCheck({ tradeId, lines = 2 }: { tradeId: string; lines?: number }) {
  const { font } = useTheme();
  const check = useLatestCheck(tradeId);
  if (!check) return null;
  return (
    <View style={{ marginTop: space.sm, flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
      <VerdictPill verdict={check.verdict} />
      <Text style={[font.small, { flex: 1 }]} numberOfLines={lines}>
        {shortDate(check.date)}: {check.note}
      </Text>
    </View>
  );
}

/** Full check-in history for one trade, newest first. */
export function CheckHistory({ tradeId }: { tradeId: string }) {
  const { c, font } = useTheme();
  const { checks } = useData();
  const mine = checks.filter((k) => k.trade_id === tradeId);
  if (!mine.length) return <Text style={font.dim}>No check-ins yet. The next briefing will judge it against its plan.</Text>;
  return (
    <View style={{ gap: space.md }}>
      {mine.map((k) => (
        <View key={k.id} style={{ borderLeftWidth: 3, borderLeftColor: c.border, paddingLeft: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <VerdictPill verdict={k.verdict} />
            <Text style={font.small}>
              {shortDate(k.date)}
              {k.price != null ? ` · at ${k.price.toFixed(2)}` : ""}
            </Text>
          </View>
          <Text style={[font.body, { marginTop: 4 }]}>{k.note}</Text>
        </View>
      ))}
    </View>
  );
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
