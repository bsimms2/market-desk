import React from "react";
import { Linking } from "react-native";
import MarkdownDisplay from "react-native-markdown-display";
import { useTheme } from "../theme";

/** Briefing text. Links open outside the app (new tab / Safari sheet). No raw HTML is rendered. */
export function Markdown({ children }: { children: string }) {
  const { c } = useTheme();
  const styles = React.useMemo(
    () => ({
      body: { color: c.text, fontSize: 16, lineHeight: 24 },
      heading1: { color: c.text, fontSize: 22, fontWeight: "700" as const, marginTop: 16, marginBottom: 8 },
      heading2: { color: c.text, fontSize: 19, fontWeight: "700" as const, marginTop: 18, marginBottom: 6 },
      heading3: { color: c.text, fontSize: 17, fontWeight: "700" as const, marginTop: 14, marginBottom: 4 },
      paragraph: { marginTop: 4, marginBottom: 10 },
      strong: { fontWeight: "700" as const },
      em: { fontStyle: "italic" as const },
      link: { color: c.accent, textDecorationLine: "underline" as const },
      bullet_list: { marginBottom: 8 },
      ordered_list: { marginBottom: 8 },
      list_item: { marginBottom: 4 },
      bullet_list_icon: { color: c.textDim, marginLeft: 4, marginRight: 8 },
      ordered_list_icon: { color: c.textDim, marginLeft: 4, marginRight: 8 },
      blockquote: { backgroundColor: c.cardAlt, borderLeftColor: c.accent, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 8 },
      code_inline: { backgroundColor: c.cardAlt, color: c.text, borderRadius: 4, paddingHorizontal: 4, fontVariant: ["tabular-nums" as const] },
      code_block: { backgroundColor: c.cardAlt, color: c.text, borderRadius: 8, padding: 10 },
      fence: { backgroundColor: c.cardAlt, color: c.text, borderRadius: 8, padding: 10 },
      hr: { backgroundColor: c.border, height: 1, marginVertical: 14 },
      table: { borderColor: c.border, borderWidth: 1, borderRadius: 6, marginVertical: 8 },
      thead: { backgroundColor: c.cardAlt },
      th: { padding: 6, borderColor: c.border },
      tr: { borderColor: c.border, borderBottomWidth: 1 },
      td: { padding: 6, fontVariant: ["tabular-nums" as const] },
    }),
    [c],
  );
  return (
    <MarkdownDisplay
      style={styles}
      onLinkPress={(url) => {
        if (/^https?:\/\//.test(url)) void Linking.openURL(url);
        return false;
      }}
    >
      {children}
    </MarkdownDisplay>
  );
}
