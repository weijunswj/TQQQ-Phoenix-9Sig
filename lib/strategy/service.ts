import { readJsonCache, writeJsonCache } from '@/lib/data/cache';
import { fetchDailyPrices } from '@/lib/data/yahoo';
import { buildStrategyVariantMatrix, buildWalkForwardValidation, makeCurrentSnapshot, runBacktest } from './engine';
import { StrategyBacktest, StrategySnapshot } from './types';

type StrategyCache = {
  key: string;
  backtest: StrategyBacktest;
  current: StrategySnapshot;
};

const STRATEGY_CACHE = '.cache/strategy.json';
const STRATEGY_SCHEMA_VERSION = 'v9';

export const getStrategyPayloads = async (): Promise<{ backtest: StrategyBacktest; current: StrategySnapshot }> => {
  const key = `${new Date().toISOString().slice(0, 10)}-${STRATEGY_SCHEMA_VERSION}`;
  const cached = await readJsonCache<StrategyCache>(STRATEGY_CACHE);
  if (cached?.key === key) {
    return { backtest: cached.backtest, current: cached.current };
  }

  const data = await fetchDailyPrices();
  const backtest = runBacktest(data.TQQQ, data.SGOV);
  backtest.variantMatrix = buildStrategyVariantMatrix(data.TQQQ, data.SGOV);
  backtest.walkForward = buildWalkForwardValidation(data.TQQQ, data.SGOV);
  const current = makeCurrentSnapshot(backtest);

  await writeJsonCache(STRATEGY_CACHE, { key, backtest, current });
  return { backtest, current };
};
