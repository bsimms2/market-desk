import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Track } from "@desk/core";

export type BriefingsStackParamList = {
  BriefingsList: undefined;
  BriefingDetail: { briefingId: string };
};

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
  BriefingsTab: NavigatorScreenParams<BriefingsStackParamList>;
  JournalTab: NavigatorScreenParams<JournalStackParamList>;
  PortfolioTab: NavigatorScreenParams<PortfolioStackParamList>;
  Settings: undefined;
};

export type BriefingsProps<K extends keyof BriefingsStackParamList> = NativeStackScreenProps<BriefingsStackParamList, K>;
export type JournalProps<K extends keyof JournalStackParamList> = NativeStackScreenProps<JournalStackParamList, K>;
export type PortfolioProps<K extends keyof PortfolioStackParamList> = NativeStackScreenProps<PortfolioStackParamList, K>;
