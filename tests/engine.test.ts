import { describe, expect, it } from 'vitest';
import { makeCurrentSnapshot, runBacktest } from '@/lib/strategy/engine';
import { PricePoint } from '@/lib/strategy/types';

const makeData = (): { tqqq: PricePoint[]; sgov: PricePoint[] } => {
  const dates = [
    '2010-01-04', '2010-01-05', '2010-01-06', '2010-01-07', '2010-01-08',
    '2010-04-01', '2010-04-02', '2010-07-01', '2010-10-01',
  ];

  const tqqq = dates.map((d, i) => ({ date: d, open: 100 - i * 2, close: 100 - i * 2 }));
  const sgov = dates.map((d, i) => ({ date: d, open: 100 + i * 0.1, close: 100 + i * 0.1 }));
  return { tqqq, sgov };
};

describe('runBacktest', () => {
  it('Keeps initial allocation around 90/10.', () => {
    const { tqqq, sgov } = makeData();
    const result = runBacktest(tqqq, sgov);
    const first = result.equityCurve[0];
    expect(first.value).toBeGreaterThan(9900);
    expect(first.value).toBeLessThan(10100);
  });

  it('Creates rebalance log entries.', () => {
    const { tqqq, sgov } = makeData();
    const result = runBacktest(tqqq, sgov);
    expect(result.rebalanceLog.length).toBeGreaterThan(0);
  });

  it('Produces stable metrics schema.', () => {
    const { tqqq, sgov } = makeData();
    const result = runBacktest(tqqq, sgov);
    expect(result.metrics).toHaveProperty('finalValue');
    expect(result.metrics).toHaveProperty('cagr');
    expect(result.metrics).toHaveProperty('maxDrawdown');
    expect(result.metrics).toHaveProperty('rebalanceCount');
    expect(result.metrics).toHaveProperty('buyHoldFinalValue');
    expect(result.metrics).toHaveProperty('buyHoldCagr');
    expect(result.metrics).toHaveProperty('buyHoldMaxDrawdown');
  });

  it('Avoids defensive sleeve jump when SGOV data begins later.', () => {
    const tqqq: PricePoint[] = [
      { date: '2010-01-04', open: 100, close: 100 },
      { date: '2010-01-05', open: 100, close: 100 },
      { date: '2010-01-06', open: 100, close: 100 },
      { date: '2010-01-07', open: 100, close: 100 },
    ];
    const sgov: PricePoint[] = [
      { date: '2010-01-06', open: 100, close: 100 },
      { date: '2010-01-07', open: 100, close: 100 },
    ];

    const result = runBacktest(tqqq, sgov);
    expect(result.equityCurve[1].value).toBe(10000);
    expect(result.equityCurve[2].value).toBe(10000);
  });

  it('Calculates CAGR using elapsed calendar time.', () => {
    const tqqq: PricePoint[] = [
      { date: '2010-01-04', open: 100, close: 100 },
      { date: '2010-12-31', open: 110, close: 110 },
    ];
    const sgov: PricePoint[] = [];

    const result = runBacktest(tqqq, sgov);
    expect(result.metrics.cagr).toBeGreaterThan(8);
    expect(result.metrics.cagr).toBeLessThan(11);
  });

  it('Uses last known SGOV quote when a daily SGOV row is missing.', () => {
    const tqqq: PricePoint[] = [
      { date: '2010-01-04', open: 100, close: 100 },
      { date: '2010-01-05', open: 100, close: 100 },
      { date: '2010-01-06', open: 100, close: 100 },
      { date: '2010-01-07', open: 100, close: 100 },
    ];
    const sgov: PricePoint[] = [
      { date: '2010-01-05', open: 100, close: 100 },
      { date: '2010-01-07', open: 100, close: 100 },
    ];

    const result = runBacktest(tqqq, sgov);
    expect(result.equityCurve[2].value).toBe(10000);
  });

  it('Builds current snapshot sleeve values from live latest state.', () => {
    const tqqq: PricePoint[] = [
      { date: '2010-01-04', open: 100, close: 100 },
      { date: '2010-01-05', open: 200, close: 200 },
    ];
    const sgov: PricePoint[] = [];

    const result = runBacktest(tqqq, sgov);
    const snapshot = makeCurrentSnapshot(result);

    expect(snapshot.tqqqValue).toBeGreaterThan(snapshot.defensiveValue);
    expect(snapshot.portfolioValue).toBe(snapshot.tqqqValue + snapshot.defensiveValue);
    expect(snapshot.defensiveAsset).toBe('CASH');
  });

  it('Clamps buy size to available defensive sleeve value.', () => {
    const tqqq: PricePoint[] = [
      { date: '2010-01-04', open: 100, close: 100 },
      { date: '2010-04-01', open: 10, close: 10 },
    ];
    const sgov: PricePoint[] = [];

    const result = runBacktest(tqqq, sgov);
    const event = result.rebalanceLog.find((row) => row.date === '2010-04-01');
    expect(event?.action).toBe('buy_tqqq');
    expect(event?.tqqqTradeDollars).toBeLessThanOrEqual(1000);
    expect(event?.tqqqValue).toBeGreaterThan(0);
    expect(event?.defensiveValue).toBe(0);
    expect(event?.tqqqWeight).toBe(100);
    expect(result.latestState.tqqqTargetValue).toBeCloseTo((event?.tqqqValue ?? 0) * 1.09, 2);
    expect(result.latestState.defensiveValue).toBeGreaterThanOrEqual(0);
  });

  it('Keeps sell proceeds in defensive sleeve when SGOV row is missing on rebalance day.', () => {
    const tqqq: PricePoint[] = [
      { date: '2010-01-04', open: 100, close: 100 },
      { date: '2010-01-05', open: 100, close: 100 },
      { date: '2010-04-01', open: 200, close: 200 },
    ];
    const sgov: PricePoint[] = [
      { date: '2010-01-05', open: 100, close: 100 },
    ];

    const result = runBacktest(tqqq, sgov);
    expect(result.latestState.defensiveValue).toBeGreaterThan(1000);
    expect(result.latestState.portfolioValue).toBeGreaterThan(18000);
  });
});
