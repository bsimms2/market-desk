import React from "react";
import { Platform, Text, View } from "react-native";
import { supabase } from "../db/supabase";
import { Button, Card, Field, Input } from "../components/ui";
import { MAX_WIDTH, space, useTheme } from "../theme";

/** Magic-link sign in. Only emails in allowed_users see any data. */
export function SignInScreen() {
  const { c, font } = useTheme();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          ...(Platform.OS === "web" ? { emailRedirectTo: window.location.origin + "/market-desk/" } : {}),
        },
      });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center", alignItems: "center", padding: space.xl }}>
      <View style={{ width: "100%", maxWidth: Math.min(MAX_WIDTH, 460) }}>
        <Text style={[font.title, { textAlign: "center", marginBottom: space.xs }]}>Market Desk</Text>
        <Text style={[font.dim, { textAlign: "center", marginBottom: space.xl }]}>Briefings, paper trades, and what they taught you.</Text>
        <Card>
          {sent ? (
            <>
              <Text style={font.h2}>Check your email</Text>
              <Text style={[font.body, { marginTop: space.sm }]}>
                A sign-in link went to {email.trim()}. Open it on this device and you're in.
              </Text>
              <Button title="Use a different email" kind="ghost" onPress={() => setSent(false)} style={{ marginTop: space.md }} />
            </>
          ) : (
            <>
              <Field label="Email">
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  onSubmitEditing={() => void send()}
                />
              </Field>
              {error && <Text style={{ color: c.bad, marginBottom: space.sm }}>{error}</Text>}
              <Button title="Email me a sign-in link" onPress={() => void send()} busy={busy} disabled={!email.includes("@")} />
            </>
          )}
        </Card>
      </View>
    </View>
  );
}
