import React from "react";
import { Text, View } from "react-native";
import { BRIEFING_LABEL, type BriefingKind } from "@desk/core";
import { useData } from "../db/data";
import { Empty, Pill, PressCard, Row, Screen, SectionTitle, Segmented } from "../components/ui";
import type { BriefingsProps } from "../nav";
import { space, useTheme } from "../theme";

type Filter = "all" | BriefingKind;

const SHORT: Record<BriefingKind, string> = { swing_morning: "Morning", swing_evening: "Evening", long_weekly: "Weekly" };

/** Archive: newest first, grouped by market date, filterable by kind. */
export function BriefingsScreen({ navigation }: BriefingsProps<"BriefingsList">) {
  const { font } = useTheme();
  const { briefings, trades } = useData();
  const [filter, setFilter] = React.useState<Filter>("all");

  const shown = filter === "all" ? briefings : briefings.filter((b) => b.kind === filter);
  const ideaCount = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trades) if (t.source_briefing_id) m.set(t.source_briefing_id, (m.get(t.source_briefing_id) ?? 0) + 1);
    return m;
  }, [trades]);

  const groups: { date: string; items: typeof shown }[] = [];
  for (const b of shown) {
    const last = groups[groups.length - 1];
    if (last && last.date === b.date) last.items.push(b);
    else groups.push({ date: b.date, items: [b] });
  }

  return (
    <Screen>
      <View style={{ marginBottom: space.sm }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "swing_morning", label: "Morning" },
            { value: "swing_evening", label: "Evening" },
            { value: "long_weekly", label: "Weekly" },
          ]}
        />
      </View>
      {groups.length === 0 ? (
        <Empty title="No briefings yet" hint="They arrive weekday mornings and evenings, and Sunday evenings." />
      ) : (
        groups.map((g) => (
          <View key={g.date}>
            <SectionTitle>{fmtDate(g.date)}</SectionTitle>
            {g.items.map((b) => {
              const n = ideaCount.get(b.id) ?? 0;
              return (
                <PressCard key={b.id} onPress={() => navigation.navigate("BriefingDetail", { briefingId: b.id })}>
                  <Row>
                    <Pill label={SHORT[b.kind]} tone={b.kind === "long_weekly" ? "warn" : b.kind === "swing_morning" ? "accent" : "neutral"} />
                    {n ? <Text style={font.small}>{n} idea{n === 1 ? "" : "s"}</Text> : null}
                  </Row>
                  <Text style={[font.h2, { marginTop: space.sm }]}>{b.title}</Text>
                  {b.summary ? (
                    <Text style={[font.dim, { marginTop: space.xs }]} numberOfLines={3}>
                      {b.summary}
                    </Text>
                  ) : null}
                  <Text style={[font.small, { marginTop: space.xs }]}>{BRIEFING_LABEL[b.kind]}</Text>
                </PressCard>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}

/** "2026-10-14" → "Wed, Oct 14, 2026" (read as a calendar date, not shifted by time zone). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
