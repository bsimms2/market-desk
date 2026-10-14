import React from "react";
import { Platform, Text } from "react-native";
import { useTheme } from "../theme";

/**
 * Temporary: live layout numbers from the device, for chasing the iOS Home
 * Screen strip under the tab bar from screenshots. Remove once that's fixed.
 */
export function ScreenReadout() {
  const { font } = useTheme();
  const [text, setText] = React.useState(report);
  React.useEffect(() => {
    const id = setInterval(() => setText(report()), 500);
    return () => clearInterval(id);
  }, []);
  if (!text) return null;
  return <Text style={[font.small, { fontVariant: ["tabular-nums"], marginBottom: 8 }]}>{text}</Text>;
}

function report(): string {
  if (Platform.OS !== "web") return "";
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const inset = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0).join("/");
  probe.remove();
  const rootEl = document.getElementById("root");
  const root = rootEl?.getBoundingClientRect();
  const vv = window.visualViewport;
  const standalone = (navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.("(display-mode: standalone)").matches;
  return [
    `standalone ${standalone ? "yes" : "no"} · screen ${screen.width}×${screen.height} · inner ${window.innerWidth}×${window.innerHeight}`,
    `visual ${Math.round(vv?.width ?? 0)}×${Math.round(vv?.height ?? 0)} offTop ${Math.round(vv?.offsetTop ?? 0)} · scrollY ${Math.round(window.scrollY)} · bodyScroll ${document.body.scrollTop} · docH ${document.documentElement.scrollHeight}`,
    `root ${Math.round(root?.top ?? -1)}→${Math.round(root?.bottom ?? -1)} (style bottom ${rootEl?.style.bottom || "-"}) · safe t/r/b/l ${inset}`,
  ].join("\n");
}
