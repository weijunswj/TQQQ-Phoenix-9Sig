import { describe, expect, it } from 'vitest';
import {
  currentSingaporeRefreshKey,
  msUntilNextSingaporeRefresh,
  nextSingaporeRefreshTimeMs,
} from '@/lib/time/singapore-refresh';

describe('Singapore refresh schedule', () => {
  it('waits until the same weekday 9:35 PM Singapore time before refreshing', () => {
    const nowMs = Date.parse('2026-03-30T12:30:00.000Z');

    expect(currentSingaporeRefreshKey(nowMs)).toBe('2026-03-27-sgt-2135');
    expect(new Date(nextSingaporeRefreshTimeMs(nowMs)).toISOString()).toBe('2026-03-30T13:35:00.000Z');
    expect(msUntilNextSingaporeRefresh(nowMs)).toBe(65 * 60 * 1000);
  });

  it('rolls Friday after 9:35 PM Singapore time to Monday evening', () => {
    const nowMs = Date.parse('2026-03-27T14:30:00.000Z');

    expect(currentSingaporeRefreshKey(nowMs)).toBe('2026-03-27-sgt-2135');
    expect(new Date(nextSingaporeRefreshTimeMs(nowMs)).toISOString()).toBe('2026-03-30T13:35:00.000Z');
    expect(msUntilNextSingaporeRefresh(nowMs)).toBe(71.08333333333333 * 60 * 60 * 1000);
  });

  it('holds the previous Friday key through the weekend', () => {
    const nowMs = Date.parse('2026-03-29T04:00:00.000Z');

    expect(currentSingaporeRefreshKey(nowMs)).toBe('2026-03-27-sgt-2135');
    expect(new Date(nextSingaporeRefreshTimeMs(nowMs)).toISOString()).toBe('2026-03-30T13:35:00.000Z');
  });
});
