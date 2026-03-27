import { format, fromUnixTime } from 'date-fns';
import { readJsonCache, writeJsonCache } from './cache';
import { PricePoint } from '@/lib/strategy/types';

const CACHE_PATH = '.cache/yahoo-daily.json';

type YahooRow = {
  t: number;
  o: number;
  c: number;
};

type CacheShape = {
  key: string;
  data: Record<string, PricePoint[]>;
};

const fetchTicker = async (ticker: string, fromUnix: number): Promise<PricePoint[]> => {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set('period1', String(fromUnix));
  url.searchParams.set('period2', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'history');

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Yahoo fetch failed for ${ticker}`);

  const json = await res.json();
  if (json.chart?.error) {
    throw new Error(`Yahoo chart error for ${ticker}: ${json.chart.error.description ?? 'unknown error'}`);
  }
  const result = json.chart?.result?.[0];
  if (!result) {
    throw new Error(`Yahoo payload missing result for ${ticker}`);
  }
  const timestamps: number[] = result?.timestamp ?? [];
  const quotes = result?.indicators?.quote?.[0];
  if (!quotes || timestamps.length === 0) {
    throw new Error(`Yahoo payload missing quote rows for ${ticker}`);
  }
  const opens: number[] = quotes?.open ?? [];
  const closes: number[] = quotes?.close ?? [];

  return timestamps
    .map((t, idx): YahooRow | null => {
      const o = opens[idx];
      const c = closes[idx];
      if (o == null || c == null) return null;
      return { t, o, c };
    })
    .filter((row): row is YahooRow => row !== null)
    .map((row) => ({
      date: format(fromUnixTime(row.t), 'yyyy-MM-dd'),
      open: row.o,
      close: row.c,
    }));
};

export const fetchDailyPrices = async (): Promise<Record<string, PricePoint[]>> => {
  const cacheKey = format(new Date(), 'yyyy-MM-dd');
  const cached = await readJsonCache<CacheShape>(CACHE_PATH);
  if (cached?.key === cacheKey) return cached.data;

  const fromUnix = Math.floor(Date.UTC(2010, 1, 1) / 1000);
  const [tqqq, sgov] = await Promise.all([fetchTicker('TQQQ', fromUnix), fetchTicker('SGOV', fromUnix)]);
  const data = { TQQQ: tqqq, SGOV: sgov };
  await writeJsonCache(CACHE_PATH, { key: cacheKey, data });
  return data;
};
