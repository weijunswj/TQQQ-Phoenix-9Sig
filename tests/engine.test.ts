import { describe, expect, it } from 'vitest';
import { runBacktest } from '@/lib/strategy/engine';
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
  });
});
