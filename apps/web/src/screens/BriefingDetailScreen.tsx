import React from "react";
import { ActivityIndicator, Linking, Pressable, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BRIEFING_LABEL, STATUS_LABEL, TRACK_LABEL } from "@desk/core";
import { useBriefing, useData } from "../db/data";
import { Markdown } from "../components/Markdown";
import { Card, Pill, PressCard, Row, Screen, SectionTitle } from "../components/ui";
import type { BriefingsProps } from "../nav";
import { space, useTheme } from "../theme";
import { fmtDate } from "./BriefingsScreen";

export function BriefingDetailScreen({ route }: BriefingsProps<"BriefingDetail">) {
  const { c, font } = useTheme();
  const nav = useNavigation<any>();
  const { trades } = useData();
  const { briefing, error, loading } = useBriefing(route.params?.briefingId);
  const ideas = trades.filter((t) => t.source_briefing_id === route.params?.briefingId);

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={c.accent} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }
  if (error || !briefing) {
    return (
      <Screen>
        <Text style={font.body}>{error ?? "That briefing isn't here."}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={font.small}>
        {BRIEFING_LABEL[briefing.kind]} · {fmtDate(briefing.date)}
      </Text>
      <Text style={[font.title, { marginTop: space.xs, marginBottom: space.md }]}>{briefing.title}</Text>

      {ideas.length ? (
        <>
          <SectionTitle>Ideas from this briefing</SectionTitle>
          {ideas.map((t) => (
            <PressCard key={t.id} onPress={() => nav.navigate("JournalTab", { screen: "TradeEdit", params: { tradeId: t.id } })}>
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
            </PressCard>
          ))}
        </>
      ) : null}

      <Card>
        <Markdown>{briefing.body_md}</Markdown>
      </Card>

      {briefing.sources.length ? (
        <>
          <SectionTitle>Sources</SectionTitle>
          <Card>
            {briefing.sources.map((s, i) => (
              <Pressable key={i} onPress={() => void Linking.openURL(s.url)} style={{ paddingVertical: 6 }}>
                <Text style={{ color: c.accent, fontSize: 15, textDecorationLine: "underline" }}>{s.title}</Text>
                <Text style={font.small} numberOfLines={1}>
                  {hostOf(s.url)}
                </Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
