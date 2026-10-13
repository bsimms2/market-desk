import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Track } from "@desk/core";

export type JournalStackParamList = {
  JournalList: undefined;
  TradeEdit: { tradeId?: string; track?: Track };
};

export type PortfolioStackParamList = {
  PortfolioList: undefined;
  HoldingEdit: { holdingId?: string };
};

export type TabParamList = {
  Today: undefined;
  JournalTab: NavigatorScreenParams<JournalStackParamList>;
  PortfolioTab: NavigatorScreenParams<PortfolioStackParamList>;
  Settings: undefined;
};

export type JournalProps<K extends keyof JournalStackParamList> = NativeStackScreenProps<JournalStackParamList, K>;
export type PortfolioProps<K extends keyof PortfolioStackParamList> = NativeStackScreenProps<PortfolioStackParamList, K>;
