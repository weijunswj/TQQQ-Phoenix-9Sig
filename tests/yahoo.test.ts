import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rm, mkdir, writeFile } from 'node:fs/promises';
import { fetchDailyPrices } from '@/lib/data/yahoo';

const cachePath = '.cache/yahoo-daily.json';

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(cachePath, { force: true });
});

beforeEach(async () => {
  await rm(cachePath, { force: true });
});

describe('fetchDailyPrices', () => {
  it('Throws when Yahoo payload result is missing.', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ chart: { result: [] } }) })) as unknown as typeof fetch);

    await expect(fetchDailyPrices()).rejects.toThrow(/missing result/i);
  });

  it('Throws when Yahoo payload has chart error.', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ chart: { error: { description: 'bad symbol' } } }) })) as unknown as typeof fetch,
    );

    await expect(fetchDailyPrices()).rejects.toThrow(/chart error/i);
  });

  it('Returns stale fallback metadata without rewriting cache key semantics.', async () => {
    await mkdir('.cache', { recursive: true });
    await writeFile(
      cachePath,
      JSON.stringify({
        key: '2026-03-27',
        data: {
          TQQQ: [{ date: '2026-03-27', open: 100, close: 101 }],
          SGOV: [{ date: '2026-03-27', open: 100, close: 100.1 }],
        },
      }),
      'utf-8',
    );
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })) as unknown as typeof fetch);

    const result = await fetchDailyPrices();
    expect(result.key).toBe('2026-03-27');
    expect(result.isStaleFallback).toBe(true);
  });
});
