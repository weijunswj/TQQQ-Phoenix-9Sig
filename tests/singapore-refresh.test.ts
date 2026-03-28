import { describe, expect, it } from 'vitest';
import {
  currentSingaporeRefreshKey,
  msUntilNextSingaporeRefresh,
  nextSingaporeRefreshTimeMs,
} from '@/lib/time/singapore-refresh';

describe('Singapore refresh schedule', () => {
  it('waits until the same weekday 8:00 AM Singapore time before refreshing', () => {
    const nowMs = Date.parse('2026-03-29T23:30:00.000Z');

    expect(currentSingaporeRefreshKey(nowMs)).toBe('2026-03-27-sgt-0800');
    expect(new Date(nextSingaporeRefreshTimeMs(nowMs)).toISOString()).toBe('2026-03-30T00:00:00.000Z');
    expect(msUntilNextSingaporeRefresh(nowMs)).toBe(30 * 60 * 1000);
  });

  it('rolls Friday after 8:00 AM Singapore time to Monday morning', () => {
    const nowMs = Date.parse('2026-03-27T02:30:00.000Z');

    expect(currentSingaporeRefreshKey(nowMs)).toBe('2026-03-27-sgt-0800');
    expect(new Date(nextSingaporeRefreshTimeMs(nowMs)).toISOString()).toBe('2026-03-30T00:00:00.000Z');
    expect(msUntilNextSingaporeRefresh(nowMs)).toBe(69.5 * 60 * 60 * 1000);
  });

  it('holds the previous Friday key through the weekend', () => {
    const nowMs = Date.parse('2026-03-29T04:00:00.000Z');

    expect(currentSingaporeRefreshKey(nowMs)).toBe('2026-03-27-sgt-0800');
    expect(new Date(nextSingaporeRefreshTimeMs(nowMs)).toISOString()).toBe('2026-03-30T00:00:00.000Z');
  });
});
