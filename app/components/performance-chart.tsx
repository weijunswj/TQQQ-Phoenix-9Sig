'use client';

import { parseISO, subMonths, subYears } from 'date-fns';
import { useMemo, useState } from 'react';

type Point = { date: string; value: number };

type Props = {
  strategySeries: Point[];
  buyHoldSeries: Point[];
};

type Range = '3m' | '6m' | '1y' | '3y' | '5y' | 'all';

const WIDTH = 860;
const HEIGHT = 280;
const PAD = 28;

const fmt = (n: number): string => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const cutoffForRange = (range: Range, endDate: Date): Date | null => {
  if (range === 'all') return null;
  if (range === '3m') return subMonths(endDate, 3);
  if (range === '6m') return subMonths(endDate, 6);
  if (range === '1y') return subYears(endDate, 1);
  if (range === '3y') return subYears(endDate, 3);
  return subYears(endDate, 5);
};

const toSvgPath = (values: number[], min: number, max: number): string => {
  if (values.length === 0) return '';
  const xStep = values.length === 1 ? 0 : (WIDTH - PAD * 2) / (values.length - 1);
  const yRange = Math.max(1e-9, max - min);

  return values
    .map((value, idx) => {
      const x = PAD + idx * xStep;
      const y = HEIGHT - PAD - ((value - min) / yRange) * (HEIGHT - PAD * 2);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

export function PerformanceChart({ strategySeries, buyHoldSeries }: Props) {
  const [range, setRange] = useState<Range>('all');

  const filtered = useMemo(() => {
    const end = parseISO(strategySeries[strategySeries.length - 1]?.date ?? new Date().toISOString().slice(0, 10));
    const cutoff = cutoffForRange(range, end);

    const strategy = cutoff ? strategySeries.filter((p) => parseISO(p.date) >= cutoff) : strategySeries;
    const buyHold = cutoff ? buyHoldSeries.filter((p) => parseISO(p.date) >= cutoff) : buyHoldSeries;

    const clippedLength = Math.min(strategy.length, buyHold.length);
    const clippedStrategy = strategy.slice(-clippedLength);
    const clippedBuyHold = buyHold.slice(-clippedLength);

    const allValues = [...clippedStrategy.map((p) => p.value), ...clippedBuyHold.map((p) => p.value)];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);

    return {
      strategy: clippedStrategy,
      buyHold: clippedBuyHold,
      strategyPath: toSvgPath(clippedStrategy.map((p) => p.value), min, max),
      buyHoldPath: toSvgPath(clippedBuyHold.map((p) => p.value), min, max),
    };
  }, [range, strategySeries, buyHoldSeries]);

  const strategyStart = filtered.strategy[0]?.value ?? 0;
  const strategyEnd = filtered.strategy[filtered.strategy.length - 1]?.value ?? 0;
  const buyHoldStart = filtered.buyHold[0]?.value ?? 0;
  const buyHoldEnd = filtered.buyHold[filtered.buyHold.length - 1]?.value ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
        <p className="small" style={{ margin: 0 }}>
          Full backtest is always run across all data. This selector only changes chart visibility.
        </p>
        <label className="small" htmlFor="range-select">
          Time range{' '}
          <select id="range-select" value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="3m">3M</option>
            <option value="6m">6M</option>
            <option value="1y">1Y</option>
            <option value="3y">3Y</option>
            <option value="5y">5Y</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Strategy and buy and hold equity chart">
          <path d={filtered.buyHoldPath} fill="none" stroke="#b57600" strokeWidth="2" />
          <path d={filtered.strategyPath} fill="none" stroke="#2e7d32" strokeWidth="2" />
        </svg>
      </div>

      <p className="small" style={{ marginTop: '.5rem' }}>
        <strong style={{ color: '#2e7d32' }}>Phoenix 9Sig:</strong> {fmt(strategyStart)} → {fmt(strategyEnd)} &nbsp;|&nbsp;
        <strong style={{ color: '#b57600' }}>Buy & hold (TQQQ):</strong> {fmt(buyHoldStart)} → {fmt(buyHoldEnd)}
      </p>
    </div>
  );
}
