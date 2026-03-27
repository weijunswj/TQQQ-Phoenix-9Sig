export type RuleState = {
  athDdActive: boolean;
  skipSellDaysRemaining: number;
  skipSellWindowEnds: string | null;
  floorTriggered: boolean;
};

export type RebalanceAction = 'buy_tqqq' | 'sell_tqqq' | 'hold';

export type RebalanceEvent = {
  date: string;
  action: RebalanceAction;
  tqqqTradeDollars: number;
  defensiveTradeDollars: number;
  tqqqWeight: number;
  defensiveWeight: number;
  ruleState: RuleState;
  reason: string;
};

export type StrategySnapshot = {
  asOfDate: string;
  marketTimestamp: number;
  nextRebalanceDate: string;
  action: string;
  portfolioValue: number;
  tqqqValue: number;
  defensiveValue: number;
  tqqqTargetValue: number;
  ruleState: RuleState;
};

export type BenchmarkSeries = {
  tqqqBuyAndHold: Array<{ date: string; value: number }>;
  defensiveSleeve: Array<{ date: string; value: number }>;
};

export type StrategyBacktest = {
  equityCurve: Array<{ date: string; value: number }>;
  benchmark: BenchmarkSeries;
  metrics: {
    finalValue: number;
    cagr: number;
    maxDrawdown: number;
    rebalanceCount: number;
  };
  rebalanceLog: RebalanceEvent[];
};

export type PricePoint = {
  date: string;
  open: number;
  close: number;
};
