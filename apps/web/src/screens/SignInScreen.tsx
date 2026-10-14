import React from "react";
import { Platform, Text, View } from "react-native";
import { supabase } from "../db/supabase";
import { Button, Card, Field, Input, Segmented } from "../components/ui";
import { MAX_WIDTH, space, useTheme } from "../theme";

type Mode = "password" | "link";

/**
 * Two ways in. Only emails in allowed_users see any data.
 * - Email link: works in Safari / a desktop browser.
 * - Password: needed for the iPhone/iPad Home Screen app, because links from
 *   Mail always open in Safari, which keeps a separate sign-in. Set the
 *   password once from Settings while signed in via the link.
 *   (The free Supabase plan can't add a typed code to the default email.)
 */
export function SignInScreen() {
  const { c, font } = useTheme();
  const standalone =
    Platform.OS === "web" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  const [mode, setMode] = React.useState<Mode>(standalone ? "password" : "link");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function sendLink() {
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

  async function signInWithPassword() {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      // onAuthStateChange in App.tsx takes it from here.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /invalid login/i.test(msg)
          ? "Email or password didn't match. No password yet? Sign in with the email link in Safari, then Settings → Set a password."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  const emailField = (
    <Field label="Email">
      <Input
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        onSubmitEditing={() => (mode === "link" ? void sendLink() : undefined)}
      />
    </Field>
  );

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
              {standalone ? (
                <Text style={[font.dim, { marginTop: space.sm }]}>
                  On the Home Screen app the link will open in Safari instead. Sign in there, set a password in Settings, then come
                  back here and use Password.
                </Text>
              ) : null}
              <Button title="Back" kind="ghost" onPress={() => setSent(false)} style={{ marginTop: space.md }} />
            </>
          ) : (
            <>
              <View style={{ marginBottom: space.md }}>
                <Segmented<Mode>
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setError(null);
                  }}
                  options={[
                    { value: "password", label: "Password" },
                    { value: "link", label: "Email link" },
                  ]}
                />
              </View>
              {emailField}
              {mode === "password" ? (
                <Field label="Password">
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="current-password"
                    textContentType="password"
                    onSubmitEditing={() => void signInWithPassword()}
                  />
                </Field>
              ) : null}
              {error && <Text style={{ color: c.bad, marginBottom: space.sm }}>{error}</Text>}
              {mode === "password" ? (
                <Button title="Sign in" onPress={() => void signInWithPassword()} busy={busy} disabled={!email.includes("@") || !password} />
              ) : (
                <Button title="Email me a sign-in link" onPress={() => void sendLink()} busy={busy} disabled={!email.includes("@")} />
              )}
            </>
          )}
        </Card>
      </View>
    </View>
  );
}
