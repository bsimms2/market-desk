import React from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BRIEFING_LABEL, daysHeld, fmtPct, fmtPrice, TRACK_LABEL, trackStats, type Track } from "@desk/core";
import { useData } from "../db/data";
import { Card, Empty, PressCard, Row, Screen, SectionTitle, Stat } from "../components/ui";
import { space, useTheme } from "../theme";

/** Phase 1 home: latest briefing headline, open positions, per-track stats. Fuller dashboard comes in phase 2. */
export function TodayScreen() {
  const { c, font } = useTheme();
  const nav = useNavigation<any>();
  const { trades, briefings } = useData();
  const latest = briefings[0];
  const open = trades.filter((t) => t.status === "open");

  return (
    <Screen>
      <SectionTitle>Latest briefing</SectionTitle>
      {latest ? (
        <Card>
          <Text style={font.small}>
            {BRIEFING_LABEL[latest.kind]} · {latest.date}
          </Text>
          <Text style={[font.h2, { marginTop: 2 }]}>{latest.title}</Text>
          {latest.summary ? <Text style={[font.body, { marginTop: space.sm }]}>{latest.summary}</Text> : null}
        </Card>
      ) : (
        <Card>
          <Text style={font.dim}>No briefings yet. The first one arrives once the scheduled agent is switched on.</Text>
        </Card>
      )}

      <SectionTitle>Open positions</SectionTitle>
      {open.length === 0 ? (
        <Empty title="Nothing open" hint="Mark an idea Open in the Journal when you take the paper trade." />
      ) : (
        open.map((t) => {
          const held = daysHeld(t);
          return (
            <PressCard key={t.id} onPress={() => nav.navigate("JournalTab", { screen: "TradeEdit", params: { tradeId: t.id } })}>
              <Row>
                <Text style={font.ticker}>
                  {t.ticker} <Text style={font.dim}>{t.structure}</Text>
                </Text>
                <Text style={font.small}>{TRACK_LABEL[t.track]}</Text>
              </Row>
              <Text style={[font.small, { marginTop: space.xs }]}>
                In at {fmtPrice(t.entry_price)}
                {held != null ? ` · day ${held}` : ""}
              </Text>
              {t.invalidation ? (
                <Text style={[font.small, { color: c.warn, marginTop: 2 }]} numberOfLines={2}>
                  Wrong if: {t.invalidation}
                </Text>
              ) : null}
            </PressCard>
          );
        })
      )}

      {(["swing", "long"] as Track[]).map((tr) => {
        const s = trackStats(trades, tr);
        return (
          <View key={tr}>
            <SectionTitle>{TRACK_LABEL[tr]}</SectionTitle>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              <Stat label="Ideas · open · closed" value={`${s.ideas} · ${s.open} · ${s.closed}`} />
              <Stat label="Win rate" value={s.all.winRate == null ? "—" : `${s.all.winRate}%`} sub={`${s.all.wins}/${s.all.closed} closed`} />
              <Stat label="Avg return · stock" value={fmtPct(s.stock.avgReturn)} tone={s.stock.avgReturn} sub={`${s.stock.closed} closed`} />
              <Stat label="Avg return · option" value={fmtPct(s.option.avgReturn)} tone={s.option.avgReturn} sub={`${s.option.closed} closed`} />
              <Stat label="Taken vs passed" value={s.takenRate == null ? "—" : `${s.takenRate}% taken`} sub={`${s.passed} passed`} />
            </View>
          </View>
        );
      })}
    </Screen>
  );
}
