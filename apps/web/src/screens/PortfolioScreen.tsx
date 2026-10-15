import React from "react";
import { Text, View } from "react-native";
import { fmtPct, fmtPrice, holdingValue, portfolioTotals, type Holding } from "@desk/core";
import { useData } from "../db/data";
import { latestPrices } from "../db/quotes";
import { Button, Card, Empty, Pill, PressCard, Row, Screen, Signed, Stat } from "../components/ui";
import type { PortfolioProps } from "../nav";
import { space, useTheme } from "../theme";

const money = (n: number | null) => (n == null ? "—" : fmtPrice(n));
const signedMoney = (n: number | null) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + fmtPrice(Math.abs(n)));

export function PortfolioScreen({ navigation }: PortfolioProps<"PortfolioList">) {
  const { font } = useTheme();
  const { holdings, setHoldingPrices } = useData();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function refreshPrices() {
    setBusy(true);
    setMsg(null);
    try {
      const prices = await latestPrices([...new Set(holdings.filter((h) => h.active).map((h) => h.ticker))]);
      const n = await setHoldingPrices(prices);
      setMsg(`Updated ${n} price${n === 1 ? "" : "s"}.`);
    } catch (e) {
      setMsg(`Couldn't refresh: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  const active = holdings.filter((h) => h.active);
  const inactive = holdings.filter((h) => !h.active);
  const tot = portfolioTotals(holdings);

  return (
    <Screen>
      <Row style={{ marginBottom: space.md }}>
        <Text style={font.dim}>Your real holdings. The agent reads these and writes about them; it never trades.</Text>
      </Row>
      {active.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md }}>
          <Stat label="Value" value={money(tot.value)} sub={tot.asOf ? `prices as of ${tot.asOf}` : "no prices yet"} />
          <Stat label="Cost" value={money(tot.cost)} />
          <Stat label="Gain" value={signedMoney(tot.gain)} sub={fmtPct(tot.gainPct)} tone={tot.gain} />
        </View>
      ) : null}
      {tot.incomplete ? (
        <Text style={[font.small, { marginBottom: space.md }]}>
          {tot.incomplete} holding{tot.incomplete === 1 ? "" : "s"} left out of the totals (missing cost or price).
        </Text>
      ) : null}
      <Row style={{ marginBottom: space.md, justifyContent: "flex-start", flexWrap: "wrap" }}>
        <Button title="+ Add holding" kind="secondary" onPress={() => navigation.navigate("HoldingEdit", {})} />
        {active.length ? <Button title="↻ Refresh prices" kind="ghost" onPress={() => void refreshPrices()} busy={busy} /> : null}
      </Row>
      {msg ? <Text style={[font.small, { marginBottom: space.md }]}>{msg}</Text> : null}
      {active.length === 0 ? (
        <Empty title="No holdings yet" hint="Add what you own so the briefings can talk about it." />
      ) : (
        active.map((h) => <HoldingRow key={h.id} h={h} onPress={() => navigation.navigate("HoldingEdit", { holdingId: h.id })} />)
      )}
      {inactive.length ? (
        <Card>
          <Text style={font.small}>Sold / hidden: {inactive.map((h) => h.ticker).join(", ")}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function HoldingRow({ h, onPress }: { h: Holding; onPress: () => void }) {
  const { font } = useTheme();
  const v = holdingValue(h);
  return (
    <PressCard onPress={onPress}>
      <Row>
        <Row style={{ justifyContent: "flex-start", flexShrink: 1 }}>
          <Text style={font.ticker}>{h.ticker}</Text>
          {h.name ? (
            <Text style={[font.dim, { flexShrink: 1 }]} numberOfLines={1}>
              {h.name}
            </Text>
          ) : null}
        </Row>
        {h.kind !== "stock" ? <Pill label={h.kind.toUpperCase()} /> : null}
      </Row>
      <Row style={{ marginTop: space.sm }}>
        <Text style={[font.small, { fontVariant: ["tabular-nums"] }]}>
          {h.shares} {h.kind === "option" ? "contract" + (h.shares === 1 ? "" : "s") : "sh"} @ {fmtPrice(h.cost_basis)}
          {h.last_price != null ? ` · now ${fmtPrice(h.last_price)}` : ""}
          {h.account ? ` · ${h.account}` : ""}
        </Text>
        <Signed value={v.gainPct} text={fmtPct(v.gainPct)} />
      </Row>
      {h.thesis ? (
        <Text style={[font.small, { marginTop: space.xs }]} numberOfLines={2}>
          Why I own it: {h.thesis}
        </Text>
      ) : null}
    </PressCard>
  );
}
