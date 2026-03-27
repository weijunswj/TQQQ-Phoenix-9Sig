import { afterEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { fetchDailyPrices } from '@/lib/data/yahoo';

const cachePath = '.cache/yahoo-daily.json';

afterEach(async () => {
  vi.restoreAllMocks();
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
});
