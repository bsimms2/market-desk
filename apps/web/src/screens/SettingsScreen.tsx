import React from "react";
import { Text } from "react-native";
import { supabase } from "../db/supabase";
import { useData } from "../db/data";
import { Alert } from "../components/dialog";
import { ScreenReadout } from "../components/ScreenReadout";
import { Button, Card, Field, Input, Screen, SectionTitle } from "../components/ui";
import { space, useTheme } from "../theme";

export function SettingsScreen() {
  const { font } = useTheme();
  const { refresh, loadedAt } = useData();
  const [email, setEmail] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pw, setPw] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);

  async function savePassword() {
    if (pw.length < 8) return Alert.alert("Too short", "Use at least 8 characters.");
    if (pw !== pw2) return Alert.alert("Passwords don't match", "Type the same password twice.");
    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw("");
      setPw2("");
      Alert.alert("Password set", "On the Home Screen app, choose Password and sign in with your email and this password.");
    } catch (e) {
      Alert.alert("Couldn't set password", e instanceof Error ? e.message : String(e));
    } finally {
      setPwBusy(false);
    }
  }

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
      <SectionTitle>Password</SectionTitle>
      <Card>
        <Text style={[font.dim, { marginBottom: space.md }]}>
          For the Home Screen app: email links always open in Safari, so sign in there with a password instead. Setting one here
          also changes it if you already have one.
        </Text>
        <Field label="New password">
          <Input value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        </Field>
        <Field label="Same again">
          <Input value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        </Field>
        <Button title="Set password" onPress={() => void savePassword()} busy={pwBusy} disabled={!pw || !pw2} />
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
      <SectionTitle>Screen</SectionTitle>
      <Card>
        <ScreenReadout />
      </Card>
    </Screen>
  );
}
