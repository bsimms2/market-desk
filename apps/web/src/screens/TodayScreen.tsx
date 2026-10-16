import React from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BRIEFING_LABEL, daysHeld, fmtPct, fmtPrice, portfolioTotals, STATUS_LABEL, TRACK_LABEL, trackStats, type Track } from "@desk/core";
import { useData } from "../db/data";
import { Card, Empty, Pill, PressCard, Row, Screen, SectionTitle, Signed, Stat } from "../components/ui";
import { space, useTheme } from "../theme";
import { fmtDate } from "./BriefingsScreen";
import { LatestCheck } from "../components/CheckBadge";

const signedMoney = (n: number | null) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + fmtPrice(Math.abs(n)));

/** Home: latest briefing, its new ideas, the portfolio at a glance, open paper positions, per-track stats. */
export function TodayScreen() {
  const { c, font } = useTheme();
  const nav = useNavigation<any>();
  const { trades, briefings, holdings } = useData();
  const latest = briefings[0];
  const open = trades.filter((t) => t.status === "open");
  const newIdeas = latest ? trades.filter((t) => t.source_briefing_id === latest.id) : [];
  const tot = portfolioTotals(holdings);
  const openTrade = (id: string) => nav.navigate("JournalTab", { screen: "TradeEdit", params: { tradeId: id } });

  return (
    <Screen>
      <SectionTitle
        right={
          briefings.length > 1 ? (
            <Text style={[font.small, { color: c.accent }]} onPress={() => nav.navigate("BriefingsTab", { screen: "BriefingsList" })}>
              All briefings ›
            </Text>
          ) : undefined
        }
      >
        Latest briefing
      </SectionTitle>
      {latest ? (
        <PressCard onPress={() => nav.navigate("BriefingsTab", { screen: "BriefingDetail", params: { briefingId: latest.id } })}>
          <Text style={font.small}>
            {BRIEFING_LABEL[latest.kind]} · {fmtDate(latest.date)}
          </Text>
          <Text style={[font.h2, { marginTop: 2 }]}>{latest.title}</Text>
          {latest.summary ? <Text style={[font.body, { marginTop: space.sm }]}>{latest.summary}</Text> : null}
          <Text style={[font.small, { color: c.accent, marginTop: space.sm }]}>Read the full briefing ›</Text>
        </PressCard>
      ) : (
        <Card>
          <Text style={font.dim}>No briefings yet. The first one arrives once the scheduled agent is switched on.</Text>
        </Card>
      )}

      {newIdeas.length ? (
        <>
          <SectionTitle>Ideas in this briefing</SectionTitle>
          {newIdeas.map((t) => (
            <PressCard key={t.id} onPress={() => openTrade(t.id)}>
              <Row>
                <Text style={font.ticker}>
                  {t.ticker}{" "}
                  <Text style={[font.dim, { color: t.direction === "long" ? c.good : c.bad, fontWeight: "700" }]}>
                    {t.direction === "long" ? "▲ Long" : "▼ Short"}
                  </Text>
                </Text>
                <Pill label={STATUS_LABEL[t.status]} tone={t.status === "idea" ? "accent" : t.status === "open" ? "warn" : "neutral"} />
              </Row>
              <Text style={[font.dim, { marginTop: 2 }]}>
                {TRACK_LABEL[t.track]} · {t.structure}
              </Text>
              {t.thesis ? (
                <Text style={[font.small, { marginTop: space.xs }]} numberOfLines={2}>
                  {t.thesis}
                </Text>
              ) : null}
            </PressCard>
          ))}
        </>
      ) : null}

      {holdings.some((h) => h.active) ? (
        <>
          <SectionTitle>Your portfolio</SectionTitle>
          <PressCard onPress={() => nav.navigate("PortfolioTab", { screen: "PortfolioList" })}>
            <Row>
              <View>
                <Text style={font.small}>Value</Text>
                <Text style={font.big}>{tot.value == null ? "—" : fmtPrice(tot.value)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={font.small}>Gain</Text>
                <Signed value={tot.gain} text={signedMoney(tot.gain)} style={{ fontSize: 18 }} />
                <Signed value={tot.gainPct} text={fmtPct(tot.gainPct)} style={{ fontSize: 14 }} />
              </View>
            </Row>
            <Text style={[font.small, { marginTop: space.xs }]}>{tot.asOf ? `Prices as of ${fmtDate(tot.asOf)}` : "No prices yet"}</Text>
          </PressCard>
        </>
      ) : null}

      <SectionTitle>Open paper positions</SectionTitle>
      {open.length === 0 ? (
        <Empty title="Nothing open" hint="Mark an idea Open in the Journal when you take the paper trade." />
      ) : (
        open.map((t) => {
          const held = daysHeld(t);
          return (
            <PressCard key={t.id} onPress={() => openTrade(t.id)}>
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
              <LatestCheck tradeId={t.id} />
            </PressCard>
          );
        })
      )}

      {(["swing", "long"] as Track[]).map((tr) => {
        const s = trackStats(trades, tr);
        return (
          <View key={tr}>
            <SectionTitle>{TRACK_LABEL[tr]} track</SectionTitle>
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
