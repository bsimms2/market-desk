import { Alert as RNAlert, Platform } from "react-native";

/**
 * React Native Web doesn't implement Alert.alert (it silently does nothing),
 * which would make every confirmation a no-op in the browser.
 * Same signature as RN's Alert; on the web it maps to window.confirm/alert.
 */
export interface AlertButton {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    if (Platform.OS !== "web") {
      RNAlert.alert(title, message, buttons);
      return;
    }
    const text = message ? `${title}\n\n${message}` : title;
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const cancel = buttons.find((b) => b.style === "cancel");
    const go = buttons.find((b) => b !== cancel);
    if (window.confirm(text)) go?.onPress?.();
    else cancel?.onPress?.();
  },
};
