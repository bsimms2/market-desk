import React from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import {
  DarkTheme,
  DefaultTheme,
  getPathFromState,
  getStateFromPath,
  NavigationContainer,
  type LinkingOptions,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from "./src/db/supabase";
import { DataProvider } from "./src/db/data";
import type { BriefingsStackParamList, JournalStackParamList, PortfolioStackParamList, TabParamList } from "./src/nav";
import { Button } from "./src/components/ui";
import { TabBar } from "./src/components/TabBar";
import { SignInScreen } from "./src/screens/SignInScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { LiveScreen } from "./src/screens/LiveScreen";
import { BriefingsScreen } from "./src/screens/BriefingsScreen";
import { BriefingDetailScreen } from "./src/screens/BriefingDetailScreen";
import { JournalScreen } from "./src/screens/JournalScreen";
import { TradeEditScreen } from "./src/screens/TradeEditScreen";
import { PortfolioScreen } from "./src/screens/PortfolioScreen";
import { HoldingEditScreen } from "./src/screens/HoldingEditScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { space, ThemeProvider, useTheme } from "./src/theme";

const Tab = createBottomTabNavigator<TabParamList>();
const BriefingsStack = createNativeStackNavigator<BriefingsStackParamList>();
const JournalStack = createNativeStackNavigator<JournalStackParamList>();
const PortfolioStack = createNativeStackNavigator<PortfolioStackParamList>();

// The site lives under this path on GitHub Pages (app.json "baseUrl"). React
// Navigation ignores `prefixes` on web and pushes bare paths like "/journal",
// which would put the browser outside the site (HomeThread hit this as a 404).
// Strip the base when reading, add it back when writing.
const BASE_PATH = "/market-desk";

const linking: LinkingOptions<TabParamList> = {
  prefixes: Platform.OS === "web" ? [window.location.origin + BASE_PATH, window.location.origin] : [],
  getStateFromPath: (path, options) => {
    const stripped = path.startsWith(BASE_PATH) ? path.slice(BASE_PATH.length) : path;
    return getStateFromPath(stripped || "/", options);
  },
  getPathFromState: (state, options) => {
    const path = getPathFromState(state, options);
    return path.startsWith(BASE_PATH) ? path : BASE_PATH + (path.startsWith("/") ? path : "/" + path);
  },
  config: {
    screens: {
      Today: "",
      Live: "live",
      BriefingsTab: {
        path: "briefings",
        screens: {
          BriefingsList: "",
          BriefingDetail: ":briefingId",
        },
      },
      JournalTab: {
        path: "journal",
        screens: {
          JournalList: "",
          TradeEdit: "trade/:tradeId?",
        },
      },
      PortfolioTab: {
        path: "portfolio",
        screens: {
          PortfolioList: "",
          HoldingEdit: "holding/:holdingId?",
        },
      },
      Settings: "settings",
    },
  },
};

function useStackOptions() {
  const { c } = useTheme();
  return {
    headerStyle: { backgroundColor: c.card },
    headerTintColor: c.accent,
    headerTitleStyle: { fontWeight: "700" as const, color: c.text },
    headerBackVisible: true,
    headerBackTitle: "Back",
    contentStyle: { backgroundColor: c.bg },
  };
}

function BriefingsNav() {
  const opts = useStackOptions();
  return (
    <BriefingsStack.Navigator screenOptions={opts}>
      <BriefingsStack.Screen name="BriefingsList" component={BriefingsScreen} options={{ title: "Briefings" }} />
      <BriefingsStack.Screen name="BriefingDetail" component={BriefingDetailScreen} options={{ title: "Briefing" }} />
    </BriefingsStack.Navigator>
  );
}

function JournalNav() {
  const opts = useStackOptions();
  return (
    <JournalStack.Navigator screenOptions={opts}>
      <JournalStack.Screen name="JournalList" component={JournalScreen} options={{ title: "Journal" }} />
      <JournalStack.Screen name="TradeEdit" component={TradeEditScreen} options={({ route }) => ({ title: route.params?.tradeId ? "Entry" : "New entry" })} />
    </JournalStack.Navigator>
  );
}

function PortfolioNav() {
  const opts = useStackOptions();
  return (
    <PortfolioStack.Navigator screenOptions={opts}>
      <PortfolioStack.Screen name="PortfolioList" component={PortfolioScreen} options={{ title: "Portfolio" }} />
      <PortfolioStack.Screen name="HoldingEdit" component={HoldingEditScreen} options={({ route }) => ({ title: route.params?.holdingId ? "Holding" : "New holding" })} />
    </PortfolioStack.Navigator>
  );
}

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: string }) {
    return <Text style={{ fontSize: 20, lineHeight: 24, color }}>{glyph}</Text>;
  };

function Tabs() {
  const { c, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: c.bg, card: c.card, text: c.text, border: c.border, primary: c.accent },
  };
  return (
    <NavigationContainer theme={navTheme} linking={linking} documentTitle={{ formatter: (o) => (o?.title ? `${o.title} · Market Desk` : "Market Desk") }}>
      <Tab.Navigator
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: "700" },
          sceneStyle: { backgroundColor: c.bg },
        }}
      >
        <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarIcon: icon("⌂") }} />
        <Tab.Screen name="Live" component={LiveScreen} options={{ title: "Paper bots", tabBarIcon: icon("◉") }} />
        <Tab.Screen name="BriefingsTab" component={BriefingsNav} options={{ title: "Briefings", headerShown: false, tabBarIcon: icon("▤") }} />
        <Tab.Screen name="JournalTab" component={JournalNav} options={{ title: "Journal", headerShown: false, tabBarIcon: icon("✎") }} />
        <Tab.Screen name="PortfolioTab" component={PortfolioNav} options={{ title: "Portfolio", headerShown: false, tabBarIcon: icon("◔") }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon("≡") }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: space.xl }}>{children}</View>;
}

function Root() {
  const { c, font, dark } = useTheme();
  const [session, setSession] = React.useState<Session | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const onError = React.useCallback((msg: string) => setError(msg), []);

  let body: React.ReactNode;
  if (session === undefined) {
    body = (
      <Centered>
        <ActivityIndicator color={c.accent} />
      </Centered>
    );
  } else if (!session) {
    body = <SignInScreen />;
  } else if (error) {
    body = (
      <Centered>
        <Text style={[font.h2, { marginBottom: space.sm }]}>Couldn't load your data</Text>
        <Text style={[font.dim, { textAlign: "center", marginBottom: space.lg }]}>{error}</Text>
        <Button
          title="Try again"
          onPress={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
        <Button title="Sign out" kind="ghost" onPress={() => void supabase.auth.signOut()} style={{ marginTop: space.sm }} />
      </Centered>
    );
  } else {
    body = (
      <DataProvider
        key={session.user.id + ":" + attempt}
        onError={onError}
        fallback={
          <Centered>
            <ActivityIndicator color={c.accent} />
          </Centered>
        }
      >
        <Tabs />
      </DataProvider>
    );
  }

  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      {body}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
