import React from "react";
import { Switch, Text } from "react-native";
import { fmtPrice, parsePrice, type HoldingKind } from "@desk/core";
import { useData, type HoldingDraft } from "../db/data";
import { Alert } from "../components/dialog";
import { Button, Card, DateInput, Field, Input, isIsoDate, NumInput, Pair, Row, Screen, Segmented } from "../components/ui";
import type { PortfolioProps } from "../nav";
import { space, useTheme } from "../theme";

const t2s = (v: string | number | null | undefined) => (v == null ? "" : String(v));

const KINDS: { value: HoldingKind; label: string }[] = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "fund", label: "Fund" },
  { value: "option", label: "Option" },
  { value: "other", label: "Other" },
];

export function HoldingEditScreen({ navigation, route }: PortfolioProps<"HoldingEdit">) {
  const { c, font } = useTheme();
  const { holdings, saveHolding, deleteHolding } = useData();
  const id = route.params?.holdingId;
  const existing = id ? holdings.find((h) => h.id === id) : undefined;

  const [ticker, setTicker] = React.useState(existing?.ticker ?? "");
  const [name, setName] = React.useState(t2s(existing?.name));
  const [kind, setKind] = React.useState<HoldingKind>(existing?.kind ?? "stock");
  const [shares, setShares] = React.useState(t2s(existing?.shares));
  const [cost, setCost] = React.useState(t2s(existing?.cost_basis));
  const [account, setAccount] = React.useState(t2s(existing?.account));
  const [openedOn, setOpenedOn] = React.useState(t2s(existing?.opened_on));
  const [thesis, setThesis] = React.useState(t2s(existing?.thesis));
  const [notes, setNotes] = React.useState(t2s(existing?.notes));
  const [active, setActive] = React.useState(existing?.active ?? true);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    const tk = ticker.trim().toUpperCase();
    const sh = parsePrice(shares);
    const cb = parsePrice(cost);
    const errs: string[] = [];
    if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(tk)) errs.push("Ticker looks wrong (letters, like VOO or BRK.B).");
    if (sh == null || sh < 0) errs.push(kind === "option" ? "Contracts must be a number." : "Shares must be a number.");
    if (cost.trim() && cb == null) errs.push("Cost basis isn't a number.");
    if (openedOn.trim() && !isIsoDate(openedOn.trim())) errs.push("Bought date should be YYYY-MM-DD.");
    if (errs.length) {
      Alert.alert("Check these", errs.join("\n"));
      return;
    }
    const txt = (v: string) => (v.trim() ? v.trim() : null);
    const draft: HoldingDraft = {
      ticker: tk,
      name: txt(name),
      kind,
      shares: sh ?? 0,
      cost_basis: cb,
      account: txt(account),
      opened_on: txt(openedOn),
      thesis: txt(thesis),
      notes: txt(notes),
      // Prices belong to the agent's research; keep whatever it last wrote.
      last_price: existing?.last_price ?? null,
      last_price_on: existing?.last_price_on ?? null,
      active,
    };
    setBusy(true);
    try {
      await saveHolding(draft, id);
      navigation.goBack();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert("Delete this holding?", "If you sold it, switching off “Still own it” keeps the history instead.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteHolding(id)
            .then(() => navigation.goBack())
            .catch((e) => Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e)));
        },
      },
    ]);
  }

  return (
    <Screen>
      <Card>
        <Pair>
          <Field label="Ticker">
            <Input value={ticker} onChangeText={(v) => setTicker(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="VOO" />
          </Field>
          <Field label="Name (optional)">
            <Input value={name} onChangeText={setName} placeholder="Vanguard S&P 500 ETF" />
          </Field>
        </Pair>
        <Field label="Kind">
          <Segmented<HoldingKind> value={kind} onChange={setKind} options={KINDS} />
        </Field>
        <Pair>
          <Field label={kind === "option" ? "Contracts" : "Shares"}>
            <NumInput value={shares} onChangeText={setShares} placeholder="0" />
          </Field>
          <Field label={kind === "option" ? "Cost per share (premium)" : "Cost per share"}>
            <NumInput value={cost} onChangeText={setCost} placeholder="0.00" />
          </Field>
        </Pair>
        <Pair>
          <Field label="Account (optional)">
            <Input value={account} onChangeText={setAccount} placeholder="Roth IRA" />
          </Field>
          <Field label="Bought (optional)">
            <DateInput value={openedOn} onChange={setOpenedOn} />
          </Field>
        </Pair>
        <Field label="Why I own it" hint="The agent checks this against the news each week, so say what would change your mind.">
          <Input value={thesis} onChangeText={setThesis} multiline />
        </Field>
        <Field label="Notes">
          <Input value={notes} onChangeText={setNotes} multiline />
        </Field>
        <Row>
          <Text style={font.body}>Still own it</Text>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: c.accent, false: c.border }} />
        </Row>
        {existing?.last_price != null ? (
          <Text style={[font.small, { marginTop: space.sm }]}>
            Last price {fmtPrice(existing.last_price)} on {existing.last_price_on} (updated by the agent)
          </Text>
        ) : null}
      </Card>
      <Row style={{ marginTop: space.sm }}>
        <Button title="Cancel" kind="ghost" onPress={() => navigation.goBack()} />
        <Row>
          {id ? <Button title="Delete" kind="danger" onPress={remove} /> : null}
          <Button title="Save" onPress={() => void save()} busy={busy} disabled={!ticker.trim()} />
        </Row>
      </Row>
    </Screen>
  );
}
