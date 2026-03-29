import { fromUnixTime } from 'date-fns';
import { currentSingaporeRefreshKey } from '../time/singapore-refresh.js';
import type { PricePoint } from '../strategy/types.js';
import { getDb } from '../db.js';
import { strategyCache } from '../../drizzle/schema.js';
import { eq } from 'drizzle-orm';

/** Format a Date as yyyy-MM-dd using UTC fields. */
const formatUtcDate = (date: Date): string => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

type YahooRow = { t: number; o: number; c: number };

type CacheShape = {
  key: string;
  data: Record<string, PricePoint[]>;
  retryState?: {
    refreshKey: string;
    failureCount: number;
    nextRetryAtMs: number;
  };
};

export type DailyPricePayload = {
  key: string;
  data: Record<string, PricePoint[]>;
  isStaleFallback: boolean;
  nextRetryAtMs: number | null;
};

const RETRY_DELAYS_MS = [5, 10, 30, 60, 120, 240].map((mins) => mins * 60 * 1000);
const nextRetryDelayMs = (failureCount: number): number => {
  const idx = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, failureCount - 1));
  return RETRY_DELAYS_MS[idx];
};

const YAHOO_CACHE_KEY = 'yahoo-daily-v1';

async function readCache(): Promise<CacheShape | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(strategyCache).where(eq(strategyCache.cacheKey, YAHOO_CACHE_KEY)).limit(1);
    if (!rows[0]) return null;
    return JSON.parse(rows[0].payload) as CacheShape;
  } catch {
    return null;
  }
}

async function writeCache(data: CacheShape): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const payload = JSON.stringify(data);
    await db
      .insert(strategyCache)
      .values({ cacheKey: YAHOO_CACHE_KEY, payload })
      .onDuplicateKeyUpdate({ set: { payload } });
  } catch (err) {
    console.warn('[yahoo] Failed to write cache:', err);
  }
}

const fetchTicker = async (ticker: string, fromUnix: number): Promise<PricePoint[]> => {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set('period1', String(fromUnix));
  url.searchParams.set('period2', String(Math.floor(Date.now() / 1000)));
  url.searchParams.set('interval', '1d');
  url.searchParams.set('events', 'history');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Yahoo fetch failed for ${ticker}: ${res.status}`);

  const json = await res.json();
  if (json.chart?.error) {
    throw new Error(`Yahoo chart error for ${ticker}: ${json.chart.error.description ?? 'unknown error'}`);
  }

  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo payload missing result for ${ticker}`);

  const timestamps: number[] = result?.timestamp ?? [];
  const quotes = result?.indicators?.quote?.[0];
  if (!quotes || timestamps.length === 0) throw new Error(`Yahoo payload missing quote rows for ${ticker}`);

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
      date: formatUtcDate(fromUnixTime(row.t)),
      open: row.o,
      close: row.c,
    }));
};

export const fetchDailyPrices = async (): Promise<DailyPricePayload> => {
  const cacheKey = currentSingaporeRefreshKey();
  const cached = await readCache();

  if (cached?.key === cacheKey) {
    return { key: cached.key, data: cached.data, isStaleFallback: false, nextRetryAtMs: null };
  }

  const retryState = cached?.retryState;
  const hasCachedData = Boolean(cached?.data?.TQQQ?.length && cached?.data?.SGOV?.length);
  const isRetryWindowActive = Boolean(
    retryState && retryState.refreshKey === cacheKey && Date.now() < retryState.nextRetryAtMs,
  );

  if (hasCachedData && isRetryWindowActive) {
    return {
      key: cached!.key,
      data: cached!.data,
      isStaleFallback: true,
      nextRetryAtMs: retryState!.nextRetryAtMs,
    };
  }

  try {
    const fromUnix = Math.floor(Date.UTC(2010, 1, 1) / 1000);
    const [tqqq, sgov] = await Promise.all([fetchTicker('TQQQ', fromUnix), fetchTicker('SGOV', fromUnix)]);
    const data = { TQQQ: tqqq, SGOV: sgov };
    const payload: CacheShape = { key: cacheKey, data };
    await writeCache(payload);
    return { ...payload, isStaleFallback: false, nextRetryAtMs: null };
  } catch (error) {
    if (hasCachedData) {
      const failureCount = retryState?.refreshKey === cacheKey ? retryState.failureCount + 1 : 1;
      const retryDelayMs = nextRetryDelayMs(failureCount);
      const nextRetryAtMs = Date.now() + retryDelayMs;
      await writeCache({
        ...cached!,
        retryState: { refreshKey: cacheKey, failureCount, nextRetryAtMs },
      });
      return { key: cached!.key, data: cached!.data, isStaleFallback: true, nextRetryAtMs };
    }
    if (error instanceof Error) throw error;
    throw new Error('Failed to fetch Yahoo market data');
  }
};
