import { readJsonCache, writeJsonCache } from '@/lib/data/cache';
import { fetchDailyPrices } from '@/lib/data/yahoo';
import { makeCurrentSnapshot, runBacktest } from './engine';
import { StrategyBacktest, StrategySnapshot } from './types';

type StrategyCache = {
  key: string;
  backtest: StrategyBacktest;
  current: StrategySnapshot;
};

const STRATEGY_CACHE = '.cache/strategy.json';
const STRATEGY_SCHEMA_VERSION = 'v10';

export const getStrategyPayloads = async (): Promise<{ backtest: StrategyBacktest; current: StrategySnapshot }> => {
  const today = new Date().toISOString().slice(0, 10);
  const cached = await readJsonCache<StrategyCache>(STRATEGY_CACHE);
  const optimisticKey = `${today}-${STRATEGY_SCHEMA_VERSION}`;
  if (cached?.key === optimisticKey) {
    return { backtest: cached.backtest, current: cached.current };
  }

  const market = await fetchDailyPrices();
  const key = `${market.key}-${STRATEGY_SCHEMA_VERSION}`;
  if (cached?.key === key) {
    return { backtest: cached.backtest, current: cached.current };
  }

  const backtest = runBacktest(market.data.TQQQ, market.data.SGOV);
  const current = makeCurrentSnapshot(backtest);

  await writeJsonCache(STRATEGY_CACHE, { key, backtest, current });
  return { backtest, current };
};
