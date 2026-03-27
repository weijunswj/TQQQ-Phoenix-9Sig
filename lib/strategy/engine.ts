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

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  name: 'PhoenixSig',
  trailingAthLookbackDays: 315,
  skipSellThresholdRatio: 0.7,
  skipSellWindowDays: 126,
  floorTriggerPct: 0.6,
  floorTargetPct: 0.6,
  nextQuarterTargetMultiplier: 1.15,
};

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
      let desired = tqqqTargetValue;

      if (floorTriggered) desired = portfolio * config.floorTargetPct;

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
      const guardSummary = `skipSellActive=${skipActive}; floorTriggered=${floorTriggered}; defensiveAsset=${defensiveAsset}`;
      let reason = 'Quarterly rebalance executed.';
      if (floorTriggered) {
        reason = `Floor guard triggered: TQQQ sleeve below ${(config.floorTriggerPct * 100).toFixed(0)}%, target reset to ${(config.floorTargetPct * 100).toFixed(0)}% of portfolio.`;
      } else if (sellingBlocked) {
        reason = `No trade: ATH drawdown skip-sell guard blocked a sell signal (${skipDays} days remaining).`;
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
