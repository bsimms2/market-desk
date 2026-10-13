import React from "react";
import { useColorScheme } from "react-native";

/** Cool ink-and-paper palette, with a dark twin. Gains/losses always carry a +/− sign too. */
export interface Palette {
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;
  warn: string;
  warnSoft: string;
}

const light: Palette = {
  bg: "#f4f6f8",
  card: "#ffffff",
  cardAlt: "#eceff3",
  border: "#dce1e7",
  text: "#1b2027",
  textDim: "#677180",
  accent: "#1f6f78",
  accentSoft: "#dcefef",
  onAccent: "#ffffff",
  good: "#1d7a4c",
  goodSoft: "#dff2e7",
  bad: "#b2352d",
  badSoft: "#f8e1df",
  warn: "#99600d",
  warnSoft: "#f7ebd4",
};

const dark: Palette = {
  bg: "#0f1216",
  card: "#171b21",
  cardAlt: "#21262e",
  border: "#2c323b",
  text: "#e6e9ee",
  textDim: "#98a1ad",
  accent: "#5bbac3",
  accentSoft: "#17343a",
  onAccent: "#0b1a1d",
  good: "#4cc285",
  goodSoft: "#163626",
  bad: "#f2766c",
  badSoft: "#3d1c1a",
  warn: "#e0ad4c",
  warnSoft: "#3a2c12",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };
/** Content column: comfortable on an iPad mini (744pt portrait) without stretching on a desktop. */
export const MAX_WIDTH = 720;

const tab = ["tabular-nums" as const];

function makeFont(c: Palette) {
  return {
    title: { fontSize: 22, fontWeight: "700" as const, color: c.text },
    h2: { fontSize: 17, fontWeight: "700" as const, color: c.text },
    body: { fontSize: 16, color: c.text, lineHeight: 22 },
    dim: { fontSize: 14, color: c.textDim },
    small: { fontSize: 12, color: c.textDim },
    num: { fontSize: 16, fontWeight: "600" as const, color: c.text, fontVariant: tab },
    big: { fontSize: 26, fontWeight: "700" as const, color: c.text, fontVariant: tab },
    ticker: { fontSize: 17, fontWeight: "800" as const, color: c.text, letterSpacing: 0.3 },
  };
}

export type Font = ReturnType<typeof makeFont>;
export interface Theme {
  c: Palette;
  font: Font;
  dark: boolean;
}

const themes = {
  light: { c: light, font: makeFont(light), dark: false },
  dark: { c: dark, font: makeFont(dark), dark: true },
} satisfies Record<string, Theme>;

const ThemeCtx = React.createContext<Theme>(themes.light);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  return <ThemeCtx.Provider value={scheme === "dark" ? themes.dark : themes.light}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => React.useContext(ThemeCtx);

/** Color for a signed number: green up, red down, plain for zero/unknown. */
export function toneColor(c: Palette, n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return c.text;
  return n > 0 ? c.good : c.bad;
}
