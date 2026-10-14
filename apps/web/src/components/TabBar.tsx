import React from "react";
import { Pressable, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";

/**
 * Our own tab bar. The library's bar uses fixed heights that clipped the
 * labels on iPhone (in Safari and the Home Screen app). This one sizes to its
 * content and pads for the home indicator, so nothing can be cut off.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: c.card,
        borderTopWidth: 1,
        borderTopColor: c.border,
        paddingBottom: Math.max(insets.bottom, 6),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const label = typeof options.title === "string" ? options.title : route.name;
        const focused = state.index === index;
        const color = focused ? c.accent : c.textDim;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={({ pressed }) => ({ flex: 1, alignItems: "center", paddingTop: 8, paddingBottom: 4, opacity: pressed ? 0.6 : 1 })}
          >
            {options.tabBarIcon?.({ focused, color, size: 20 })}
            <Text style={{ color, fontSize: 12, lineHeight: 16, marginTop: 2, fontWeight: focused ? "700" : "500" }} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
