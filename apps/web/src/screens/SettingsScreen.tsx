import React from "react";
import { Text } from "react-native";
import { supabase } from "../db/supabase";
import { useData } from "../db/data";
import { Button, Card, Screen, SectionTitle } from "../components/ui";
import { space, useTheme } from "../theme";

export function SettingsScreen() {
  const { font } = useTheme();
  const { refresh, loadedAt } = useData();
  const [email, setEmail] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  return (
    <Screen>
      <SectionTitle>Account</SectionTitle>
      <Card>
        <Text style={font.body}>Signed in as {email ?? "…"}</Text>
        <Button title="Sign out" kind="secondary" onPress={() => void supabase.auth.signOut()} style={{ marginTop: space.md }} />
      </Card>
      <SectionTitle>Data</SectionTitle>
      <Card>
        <Text style={font.dim}>Last loaded {new Date(loadedAt).toLocaleTimeString()}</Text>
        <Button
          title="Reload now"
          kind="secondary"
          busy={busy}
          onPress={() => {
            setBusy(true);
            void refresh().finally(() => setBusy(false));
          }}
          style={{ marginTop: space.md }}
        />
      </Card>
      <SectionTitle>About</SectionTitle>
      <Card>
        <Text style={font.dim}>
          Paper trading only. Briefings are research and learning material, not financial advice. Nothing here places orders or
          connects to a brokerage.
        </Text>
      </Card>
    </Screen>
  );
}
