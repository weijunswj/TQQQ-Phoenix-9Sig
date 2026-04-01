import { readJsonCache, writeJsonCache } from '@/lib/data/cache';
import { fetchDailyPrices } from '@/lib/data/yahoo';
import { currentSingaporeRefreshPhase } from '@/lib/time/singapore-refresh';
import { makeCurrentSnapshot, makeLiveCurrentSnapshot, runBacktest } from './engine';
import { StrategyBacktest, StrategySnapshot } from './types';

type StrategyCache = {
  key: string;
  backtest: StrategyBacktest;
  current: StrategySnapshot;
};

const STRATEGY_CACHE = '.cache/strategy.json';
const STRATEGY_SCHEMA_VERSION = 'v27';

const getLatestLiveDate = (
  confirmed: Array<{ date: string }>,
  live: Array<{ date: string }>,
): string | null => {
  const confirmedDate = confirmed[confirmed.length - 1]?.date ?? null;
  const liveDate = live[live.length - 1]?.date ?? null;
  if (!confirmedDate || !liveDate || liveDate <= confirmedDate) return null;
  return liveDate;
};

export const getStrategyPayloads = async (): Promise<{
  backtest: StrategyBacktest;
  current: StrategySnapshot;
  staleMarketData: boolean;
  nextRetryAtMs: number | null;
}> => {
  const cached = await readJsonCache<StrategyCache>(STRATEGY_CACHE);
  const market = await fetchDailyPrices();
  const key = `${market.key}-${STRATEGY_SCHEMA_VERSION}`;
  if (cached?.key === key) {
    return {
      backtest: cached.backtest,
      current: {
        ...cached.current,
        marketTimestamp: Date.now(),
      },
      staleMarketData: market.isStaleFallback,
      nextRetryAtMs: market.nextRetryAtMs,
    };
  }

  const backtest: StrategyBacktest = runBacktest(market.data.TQQQ, market.data.SGOV);
  const refreshPhase = currentSingaporeRefreshPhase();
  const liveDate = getLatestLiveDate(market.data.TQQQ, market.liveData.TQQQ);
  const liveTqqqPoint = liveDate ? market.liveData.TQQQ[market.liveData.TQQQ.length - 1] : null;
  const liveSgovCandidate = liveDate ? market.liveData.SGOV[market.liveData.SGOV.length - 1] : null;
  const liveSgovPoint = liveSgovCandidate?.date === liveDate ? liveSgovCandidate : null;
  const current = refreshPhase === 'live-open' && liveTqqqPoint
    ? makeLiveCurrentSnapshot(backtest, market.data.TQQQ, market.data.SGOV, liveTqqqPoint, liveSgovPoint)
    : makeCurrentSnapshot(backtest);

  await writeJsonCache(STRATEGY_CACHE, { key, backtest, current });
  return {
    backtest,
    current,
    staleMarketData: market.isStaleFallback,
    nextRetryAtMs: market.nextRetryAtMs,
  };
};
