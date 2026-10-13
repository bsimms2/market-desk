import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { MAX_WIDTH, radius, space, toneColor, useTheme } from "../theme";

// ---------------------------------------------------------------------------
// Layout

/** Scrolling page with the content column centred and capped for the iPad. */
export function Screen({ children, refreshing }: { children: React.ReactNode; refreshing?: boolean }) {
  const { c } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <View style={s.column}>
        {refreshing ? <ActivityIndicator color={c.accent} style={{ marginBottom: space.md }} /> : null}
        {children}
      </View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

/** A card you can tap. */
export function PressCard({ children, onPress, style }: { children: React.ReactNode; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, { backgroundColor: pressed ? c.cardAlt : c.card, borderColor: c.border }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={[s.divider, { backgroundColor: c.border }]} />;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { font } = useTheme();
  return (
    <Row style={{ marginTop: space.md, marginBottom: space.sm }}>
      <Text style={[font.small, { textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }]}>{children}</Text>
      {right}
    </Row>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  const { font } = useTheme();
  return (
    <View style={s.empty}>
      <Text style={font.h2}>{title}</Text>
      {hint ? <Text style={[font.dim, { marginTop: space.sm, textAlign: "center" }]}>{hint}</Text> : null}
    </View>
  );
}

/** Small rounded label. */
export function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "accent" | "good" | "bad" | "warn" }) {
  const { c } = useTheme();
  const map = {
    neutral: [c.cardAlt, c.textDim],
    accent: [c.accentSoft, c.accent],
    good: [c.goodSoft, c.good],
    bad: [c.badSoft, c.bad],
    warn: [c.warnSoft, c.warn],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

/** A signed number in its gain/loss color. The text always carries the sign too. */
export function Signed({ value, text, style }: { value: number | null | undefined; text: string; style?: StyleProp<TextStyle> }) {
  const { c, font } = useTheme();
  return <Text style={[font.num, style, { color: toneColor(c, value) }]}>{text}</Text>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number | null }) {
  const { c, font } = useTheme();
  return (
    <View style={[s.stat, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={font.small}>{label}</Text>
      <Text style={[font.big, { fontSize: 20, color: tone === undefined ? c.text : toneColor(c, tone) }]}>{value}</Text>
      {sub ? <Text style={font.small}>{sub}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Buttons

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = kind === "primary" ? c.accent : kind === "danger" ? c.badSoft : kind === "secondary" ? c.cardAlt : "transparent";
  const fg = kind === "primary" ? c.onAccent : kind === "danger" ? c.bad : c.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

/** Horizontal pill chooser. Big enough to hit with a thumb on the iPad. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.segItem, { backgroundColor: on ? c.accent : c.cardAlt }]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[s.segText, { color: on ? c.onAccent : c.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const { font } = useTheme();
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[font.small, s.label]}>{label}</Text>
      {children}
      {hint ? <Text style={[font.small, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const { c } = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.textDim}
      {...props}
      style={[s.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }, props.multiline && s.multi, props.style]}
    />
  );
}

/** Price/number typed as text; the screen parses on save so "12." isn't reformatted mid-typing. */
export function NumInput(props: TextInputProps) {
  return <Input keyboardType="decimal-pad" {...props} style={[s.num, props.style]} />;
}

/** Date typed as YYYY-MM-DD. */
export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      keyboardType="numbers-and-punctuation"
      autoCapitalize="none"
    />
  );
}

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Two fields side by side (they stack on a phone-width screen). */
export function Pair({ children }: { children: React.ReactNode }) {
  return <View style={s.pair}>{React.Children.map(children, (ch) => <View style={s.pairItem}>{ch}</View>)}</View>;
}

const s = StyleSheet.create({
  screen: { padding: space.lg, paddingBottom: 48, alignItems: "center" },
  column: { width: "100%", maxWidth: MAX_WIDTH },
  card: { borderRadius: radius.md, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: space.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  empty: { alignItems: "center", padding: space.xl, marginTop: space.lg },
  pill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, alignSelf: "flex-start" },
  stat: { flexGrow: 1, flexBasis: 140, borderRadius: radius.md, padding: space.md, borderWidth: StyleSheet.hairlineWidth },
  btn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.md, alignItems: "center", justifyContent: "center", minHeight: 46 },
  btnText: { fontSize: 16, fontWeight: "600" },
  seg: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segItem: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, minHeight: 38, justifyContent: "center" },
  segText: { fontWeight: "600", fontSize: 14 },
  label: { marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  multi: { minHeight: 84, textAlignVertical: "top" },
  num: { fontVariant: ["tabular-nums"], textAlign: "right" },
  pair: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  pairItem: { flexGrow: 1, flexBasis: 200 },
});
