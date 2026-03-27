import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { firstBusinessDayOfQuarter } from './calendar';
import {
  DefensiveAsset,
  PricePoint,
  RebalanceEvent,
  RuleState,
  StrategyBacktest,
  StrategyConfig,
  StrategySnapshot,
  StrategyVariantSummary,
  StrategyWalkForwardSummary,
} from './types';

const round2 = (n: number): number => Math.round(n * 100) / 100;

const drawdownFromAth = (closes: number[]): number => {
  const ath = Math.max(...closes);
  return closes[closes.length - 1] / ath;
};

const athContext = (closes: number[]): { latestClose: number; trailingAthClose: number; pctFromAth: number } => {
  const latestClose = closes[closes.length - 1];
  const trailingAthClose = Math.max(...closes);
  return {
    latestClose,
    trailingAthClose,
    pctFromAth: ((latestClose / trailingAthClose) - 1) * 100,
  };
};

const cagr = (startValue: number, endValue: number, startDate: string, endDate: string): number => {
  const elapsedDays = Math.max(1, differenceInCalendarDays(parseISO(endDate), parseISO(startDate)));
  const years = elapsedDays / 365.25;
  if (years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
};

const maxDrawdown = (series: number[]): number => {
  let peak = series[0] ?? 1;
  let maxDd = 0;
  for (const point of series) {
    peak = Math.max(peak, point);
    maxDd = Math.max(maxDd, (peak - point) / peak);
  }
  return maxDd * 100;
};

const calmarRatio = (cagrValue: number, maxDrawdownValue: number): number => {
  if (maxDrawdownValue <= 0) return 0;
  return cagrValue / maxDrawdownValue;
};

const quarterFromMonth = (month: number): 1 | 2 | 3 | 4 => {
  if (month <= 2) return 1;
  if (month <= 5) return 2;
  if (month <= 8) return 3;
  return 4;
};

const getNextRebalanceDate = (asOfDate: string): string => {
  const d = parseISO(asOfDate);
  let year = d.getUTCFullYear();
  let quarter = quarterFromMonth(d.getUTCMonth()) + 1;
  if (quarter === 5) {
    year += 1;
    quarter = 1;
  }
  return format(firstBusinessDayOfQuarter(year, quarter as 1 | 2 | 3 | 4), 'yyyy-MM-dd');
};

const filterPricesFromDate = (prices: PricePoint[], startDate: string): PricePoint[] => prices.filter((point) => point.date >= startDate);
const filterPricesInRange = (prices: PricePoint[], startDate: string, endDate: string): PricePoint[] =>
  prices.filter((point) => point.date >= startDate && point.date <= endDate);

const isTrendFilterActive = (prices: PricePoint[], index: number, config: StrategyConfig): boolean => {
  if (config.trendFilterSmaDays == null || config.trendFilterCapPct == null) return false;
  if (index <= 0) return false;

  const startIndex = Math.max(0, index - config.trendFilterSmaDays);
  const window = prices.slice(startIndex, index).map((point) => point.close);
  if (window.length < config.trendFilterSmaDays) return false;

  const previousClose = prices[index - 1]?.close;
  if (previousClose == null) return false;

  const average = window.reduce((sum, value) => sum + value, 0) / window.length;
  return previousClose < average;
};

const ROLLING_START_STEP = 21;
const MIN_ROLLING_WINDOW_DAYS = 252;
const WALK_FORWARD_TRAIN_DAYS = 252 * 5;
const WALK_FORWARD_TEST_DAYS = 252;
const WALK_FORWARD_STEP_DAYS = 252;

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  name: 'Current 9Sig',
  trailingAthLookbackDays: 315,
  skipSellThresholdRatio: 0.7,
  skipSellWindowDays: 126,
  floorTriggerPct: 0.6,
  floorTargetPct: 0.6,
  nextQuarterTargetMultiplier: 1.09,
  trendFilterSmaDays: null,
  trendFilterCapPct: null,
};

export const STRATEGY_VARIANT_CONFIGS: StrategyConfig[] = [
  DEFAULT_STRATEGY_CONFIG,
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '12.5% quarterly target',
    nextQuarterTargetMultiplier: 1.125,
  },
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '13% quarterly target',
    nextQuarterTargetMultiplier: 1.13,
  },
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '13.5% quarterly target',
    nextQuarterTargetMultiplier: 1.135,
  },
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '14% quarterly target',
    nextQuarterTargetMultiplier: 1.14,
  },
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '14.5% quarterly target',
    nextQuarterTargetMultiplier: 1.145,
  },
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '15% quarterly target',
    nextQuarterTargetMultiplier: 1.15,
  },
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '13% target + 84-day skip-sell',
    nextQuarterTargetMultiplier: 1.13,
    skipSellWindowDays: 84,
  },
  {
    ...DEFAULT_STRATEGY_CONFIG,
    name: '13% target + 200DMA cap 75%',
    nextQuarterTargetMultiplier: 1.13,
    trendFilterSmaDays: 200,
    trendFilterCapPct: 0.75,
  },
];

export const runBacktest = (tqqq: PricePoint[], sgov: PricePoint[], config: StrategyConfig = DEFAULT_STRATEGY_CONFIG): StrategyBacktest => {
  const sgovMap = new Map(sgov.map((point) => [point.date, point]));
  const rebalanceDates = new Set<string>();
  for (let y = 2010; y <= new Date().getUTCFullYear() + 1; y += 1) {
    for (const q of [1, 2, 3, 4] as const) {
      rebalanceDates.add(format(firstBusinessDayOfQuarter(y, q), 'yyyy-MM-dd'));
    }
  }

  const start = tqqq[0];
  const initialSgovPoint = sgovMap.get(start.date);
  const initialDefensiveAsset: DefensiveAsset = initialSgovPoint ? 'SGOV' : 'CASH';
  const initialTqqqTradeDollars = 10000 * 0.9;
  const initialDefensiveValue = 1000;
  let tqqqShares = initialTqqqTradeDollars / start.open;
  let defensiveCash = initialDefensiveValue;
  let defensiveSgovShares = 0;
  let defensiveInSgov = false;
  let lastKnownSgovOpen: number | null = null;
  let lastKnownSgovClose: number | null = null;
  let tqqqTargetValue = initialTqqqTradeDollars * config.nextQuarterTargetMultiplier;
  let skipSellUntilIdx = -1;

  const equityCurve: Array<{ date: string; value: number }> = [];
  const benchmarkTqqq: Array<{ date: string; value: number }> = [];
  const benchmarkDefensive: Array<{ date: string; value: number }> = [];
  const log: RebalanceEvent[] = [];
  let latestState: StrategyBacktest['latestState'] = {
    date: start.date,
    tqqqValue: round2(initialTqqqTradeDollars),
    defensiveValue: round2(initialDefensiveValue),
    portfolioValue: 10000,
    tqqqTargetValue: round2(tqqqTargetValue),
    defensiveAsset: initialDefensiveAsset,
    ruleState: {
      athDdActive: false,
      skipSellDaysRemaining: 0,
      skipSellWindowEnds: null,
      floorTriggered: false,
      latestClose: start.close,
      trailingAthClose: start.close,
      pctFromAth: 0,
    },
  };

  const inceptionTqqqShares = 10000 / start.open;
  const sgovFirstClose = sgov[0]?.close ?? 100;

  for (let i = 0; i < tqqq.length; i += 1) {
    const t = tqqq[i];
    const s = sgovMap.get(t.date);
    if (s) {
      lastKnownSgovOpen = s.open;
      lastKnownSgovClose = s.close;
    }
    if (s && !defensiveInSgov) {
      defensiveSgovShares = defensiveCash / s.open;
      defensiveCash = 0;
      defensiveInSgov = true;
    }

    const trailingStart = Math.max(0, i - (config.trailingAthLookbackDays - 1));
    const trailing = tqqq.slice(trailingStart, i + 1).map((point) => point.close);
    const ddRatio = drawdownFromAth(trailing);
    const athStats = athContext(trailing);
    if (config.skipSellWindowDays > 0 && ddRatio < config.skipSellThresholdRatio) {
      skipSellUntilIdx = i + config.skipSellWindowDays - 1;
    }

    const tqqqValue = tqqqShares * t.open;
    const defensiveOpenPrice = s?.open ?? lastKnownSgovOpen ?? 1;
    const defensiveValue = defensiveInSgov ? (defensiveSgovShares * defensiveOpenPrice) + defensiveCash : defensiveCash;
    const portfolio = tqqqValue + defensiveValue;
    const skipDays = Math.max(0, skipSellUntilIdx - i + 1);
    const floorTriggered = portfolio > 0 ? tqqqValue / portfolio < config.floorTriggerPct : false;
    const liveRuleState: RuleState = {
      athDdActive: skipDays > 0,
      skipSellDaysRemaining: skipDays,
      skipSellWindowEnds: skipDays > 0 && tqqq[skipSellUntilIdx] ? tqqq[skipSellUntilIdx].date : null,
      floorTriggered,
      latestClose: round2(athStats.latestClose),
      trailingAthClose: round2(athStats.trailingAthClose),
      pctFromAth: round2(athStats.pctFromAth),
    };

    if (rebalanceDates.has(t.date)) {
      const skipActive = i <= skipSellUntilIdx;
      const trendFilterActive = isTrendFilterActive(tqqq, i, config);
      let desired = tqqqTargetValue;

      if (floorTriggered) desired = portfolio * config.floorTargetPct;
      if (trendFilterActive && config.trendFilterCapPct != null) {
        desired = Math.min(desired, portfolio * config.trendFilterCapPct);
      }

      let action: 'buy_tqqq' | 'sell_tqqq' | 'hold' = 'hold';
      let trade = desired - tqqqValue;
      if (trade > 0) action = 'buy_tqqq';
      if (trade < 0) action = 'sell_tqqq';
      if (trade > 0) trade = Math.min(trade, defensiveValue);
      if (trade < 0) trade = Math.max(trade, -tqqqValue);

      if (action === 'sell_tqqq' && skipActive) {
        trade = 0;
        action = 'hold';
      }
      if (trade === 0) {
        action = 'hold';
      }

      if (trade !== 0) {
        tqqqShares += trade / t.open;
        if (defensiveInSgov) {
          defensiveSgovShares -= trade / defensiveOpenPrice;
        } else {
          defensiveCash -= trade;
        }
      }

      const finalTqqqValue = tqqqShares * t.open;
      tqqqTargetValue = finalTqqqValue * config.nextQuarterTargetMultiplier;

      const state: RuleState = {
        athDdActive: skipDays > 0,
        skipSellDaysRemaining: skipDays,
        skipSellWindowEnds: skipDays > 0 && tqqq[skipSellUntilIdx] ? tqqq[skipSellUntilIdx].date : null,
        floorTriggered,
        latestClose: round2(athStats.latestClose),
        trailingAthClose: round2(athStats.trailingAthClose),
        pctFromAth: round2(athStats.pctFromAth),
      };

      const sellingBlocked = skipActive && desired < tqqqValue;
      const defensiveAsset: DefensiveAsset = defensiveInSgov ? 'SGOV' : 'CASH';
      const guardSummary = `skipSellActive=${skipActive}; floorTriggered=${floorTriggered}; trendFilterActive=${trendFilterActive}; defensiveAsset=${defensiveAsset}`;
      let reason = 'Quarterly rebalance executed.';
      if (floorTriggered) {
        reason = `Floor guard triggered: TQQQ sleeve below ${(config.floorTriggerPct * 100).toFixed(0)}%, target reset to ${(config.floorTargetPct * 100).toFixed(0)}% of portfolio.`;
      } else if (sellingBlocked) {
        reason = `No trade: ATH drawdown skip-sell guard blocked a sell signal (${skipDays} days remaining).`;
      } else if (trendFilterActive && config.trendFilterCapPct != null) {
        reason = `Trend filter active: rebalance target capped to ${(config.trendFilterCapPct * 100).toFixed(0)}% TQQQ.`;
      } else if (action === 'hold') {
        reason = 'No trade: after guard checks, holdings were already within target limits.';
      }

      const defensiveAfter = defensiveInSgov ? (defensiveSgovShares * defensiveOpenPrice) + defensiveCash : defensiveCash;
      const totalAfter = finalTqqqValue + defensiveAfter;
      log.push({
        date: t.date,
        action,
        tqqqTradeDollars: round2(trade),
        defensiveTradeDollars: round2(-trade),
        tqqqValue: round2(finalTqqqValue),
        defensiveValue: round2(defensiveAfter),
        tqqqWeight: round2((finalTqqqValue / totalAfter) * 100),
        defensiveWeight: round2((1 - finalTqqqValue / totalAfter) * 100),
        ruleState: state,
        guardSummary,
        reason,
        defensiveAsset,
      });
    }

    const markTqqq = tqqqShares * t.close;
    const defensiveClosePrice = s?.close ?? lastKnownSgovClose ?? defensiveOpenPrice;
    const markDefensive = defensiveInSgov ? (defensiveSgovShares * defensiveClosePrice) + defensiveCash : defensiveCash;
    const total = markTqqq + markDefensive;

    equityCurve.push({ date: t.date, value: round2(total) });
    benchmarkTqqq.push({ date: t.date, value: round2(inceptionTqqqShares * t.close) });
    const benchmarkClose = s?.close ?? lastKnownSgovClose;
    benchmarkDefensive.push({
      date: t.date,
      value: benchmarkClose ? round2(10000 * (benchmarkClose / sgovFirstClose)) : 10000,
    });
    latestState = {
      date: t.date,
      tqqqValue: round2(markTqqq),
      defensiveValue: round2(markDefensive),
      portfolioValue: round2(total),
      tqqqTargetValue: round2(tqqqTargetValue),
      defensiveAsset: defensiveInSgov ? 'SGOV' : 'CASH',
      ruleState: liveRuleState,
    };
  }

  const first = equityCurve[0];
  const last = equityCurve[equityCurve.length - 1];
  const benchmarkFirst = benchmarkTqqq[0];
  const benchmarkLast = benchmarkTqqq[benchmarkTqqq.length - 1];

  return {
    initialState: {
      date: start.date,
      tqqqTradeDollars: round2(initialTqqqTradeDollars),
      tqqqValue: round2(initialTqqqTradeDollars),
      defensiveValue: round2(initialDefensiveValue),
      defensiveAsset: initialDefensiveAsset,
    },
    equityCurve,
    benchmark: {
      tqqqBuyAndHold: benchmarkTqqq,
      defensiveSleeve: benchmarkDefensive,
    },
    latestState,
    metrics: {
      finalValue: round2(last.value),
      cagr: round2(cagr(first.value, last.value, first.date, last.date)),
      maxDrawdown: round2(maxDrawdown(equityCurve.map((point) => point.value))),
      rebalanceCount: log.length,
      buyHoldFinalValue: round2(benchmarkLast.value),
      buyHoldCagr: round2(cagr(benchmarkFirst.value, benchmarkLast.value, benchmarkFirst.date, benchmarkLast.date)),
      buyHoldMaxDrawdown: round2(maxDrawdown(benchmarkTqqq.map((point) => point.value))),
    },
    rebalanceLog: log,
  };
};

const computeRollingWinRate = (tqqq: PricePoint[], sgov: PricePoint[], config: StrategyConfig): number => {
  const startIndexes = Array.from({ length: tqqq.length }, (_, index) => index)
    .filter((index) => index % ROLLING_START_STEP === 0)
    .filter((index) => tqqq.length - index >= MIN_ROLLING_WINDOW_DAYS);

  if (startIndexes.length === 0) return 0;

  let wins = 0;
  for (const startIndex of startIndexes) {
    const startDate = tqqq[startIndex].date;
    const variant = runBacktest(tqqq.slice(startIndex), filterPricesFromDate(sgov, startDate), config);
    if (variant.metrics.finalValue > variant.metrics.buyHoldFinalValue) {
      wins += 1;
    }
  }

  return (wins / startIndexes.length) * 100;
};

export const buildStrategyVariantMatrix = (tqqq: PricePoint[], sgov: PricePoint[]): StrategyVariantSummary[] =>
  STRATEGY_VARIANT_CONFIGS.map((config) => {
    const backtest = runBacktest(tqqq, sgov, config);
    return {
      name: config.name,
      finalValue: backtest.metrics.finalValue,
      cagr: backtest.metrics.cagr,
      maxDrawdown: backtest.metrics.maxDrawdown,
      calmar: round2(calmarRatio(backtest.metrics.cagr, backtest.metrics.maxDrawdown)),
      rebalanceCount: backtest.metrics.rebalanceCount,
      winRateVsBuyHold: round2(computeRollingWinRate(tqqq, sgov, config)),
    };
  }).sort((left, right) => right.finalValue - left.finalValue);

export const buildWalkForwardValidation = (tqqq: PricePoint[], sgov: PricePoint[]): StrategyWalkForwardSummary => {
  const folds: StrategyWalkForwardSummary['folds'] = [];
  const selectedVariantCounts = new Map<string, number>();
  let stitchedVariantValue = 10000;
  let stitchedBuyHoldValue = 10000;

  for (
    let testStartIdx = WALK_FORWARD_TRAIN_DAYS;
    testStartIdx + WALK_FORWARD_TEST_DAYS <= tqqq.length;
    testStartIdx += WALK_FORWARD_STEP_DAYS
  ) {
    const trainStartIdx = testStartIdx - WALK_FORWARD_TRAIN_DAYS;
    const trainEndIdx = testStartIdx - 1;
    const testEndIdx = testStartIdx + WALK_FORWARD_TEST_DAYS - 1;
    const trainStartDate = tqqq[trainStartIdx].date;
    const trainEndDate = tqqq[trainEndIdx].date;
    const testStartDate = tqqq[testStartIdx].date;
    const testEndDate = tqqq[testEndIdx].date;

    let selectedConfig = STRATEGY_VARIANT_CONFIGS[0];
    let bestTrainFinalValue = Number.NEGATIVE_INFINITY;

    for (const config of STRATEGY_VARIANT_CONFIGS) {
      const trainingBacktest = runBacktest(
        tqqq.slice(trainStartIdx, testStartIdx),
        filterPricesInRange(sgov, trainStartDate, trainEndDate),
        config,
      );
      if (trainingBacktest.metrics.finalValue > bestTrainFinalValue) {
        bestTrainFinalValue = trainingBacktest.metrics.finalValue;
        selectedConfig = config;
      }
    }

    const testBacktest = runBacktest(
      tqqq.slice(testStartIdx, testEndIdx + 1),
      filterPricesInRange(sgov, testStartDate, testEndDate),
      selectedConfig,
    );
    const beatBuyHold = testBacktest.metrics.finalValue > testBacktest.metrics.buyHoldFinalValue;
    stitchedVariantValue = round2(stitchedVariantValue * (testBacktest.metrics.finalValue / 10000));
    stitchedBuyHoldValue = round2(stitchedBuyHoldValue * (testBacktest.metrics.buyHoldFinalValue / 10000));
    selectedVariantCounts.set(selectedConfig.name, (selectedVariantCounts.get(selectedConfig.name) ?? 0) + 1);

    folds.push({
      trainStartDate,
      trainEndDate,
      testStartDate,
      testEndDate,
      selectedVariant: selectedConfig.name,
      testFinalValue: testBacktest.metrics.finalValue,
      testBuyHoldFinalValue: testBacktest.metrics.buyHoldFinalValue,
      testCagr: testBacktest.metrics.cagr,
      testBuyHoldCagr: testBacktest.metrics.buyHoldCagr,
      testMaxDrawdown: testBacktest.metrics.maxDrawdown,
      testBuyHoldMaxDrawdown: testBacktest.metrics.buyHoldMaxDrawdown,
      beatBuyHold,
    });
  }

  return {
    trainingWindowTradingDays: WALK_FORWARD_TRAIN_DAYS,
    testWindowTradingDays: WALK_FORWARD_TEST_DAYS,
    foldStepTradingDays: WALK_FORWARD_STEP_DAYS,
    selectionMetric: 'finalValue',
    foldCount: folds.length,
    stitchedVariantValue,
    stitchedBuyHoldValue,
    beatBuyHoldCount: folds.filter((fold) => fold.beatBuyHold).length,
    selectedVariantCounts: Array.from(selectedVariantCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    folds,
  };
};

export const makeCurrentSnapshot = (backtest: StrategyBacktest): StrategySnapshot => {
  const lastPoint = backtest.equityCurve[backtest.equityCurve.length - 1];
  const lastEvent = backtest.rebalanceLog[backtest.rebalanceLog.length - 1];
  const nextRebalanceDate = getNextRebalanceDate(lastPoint.date);

  return {
    asOfDate: lastPoint.date,
    marketTimestamp: Date.now(),
    nextRebalanceDate,
    action: `Hold / no action until next rebalance ( ${nextRebalanceDate} ).`,
    portfolioValue: backtest.latestState.portfolioValue,
    tqqqValue: backtest.latestState.tqqqValue,
    defensiveValue: backtest.latestState.defensiveValue,
    tqqqTargetValue: backtest.latestState.tqqqTargetValue,
    defensiveAsset: backtest.latestState.defensiveAsset ?? lastEvent?.defensiveAsset ?? 'CASH',
    ruleState: backtest.latestState.ruleState ?? lastEvent?.ruleState ?? {
      athDdActive: false,
      skipSellDaysRemaining: 0,
      skipSellWindowEnds: null,
      floorTriggered: false,
      latestClose: 0,
      trailingAthClose: 0,
      pctFromAth: 0,
    },
  };
};
