'use client';

import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';

export type ChartPoint = {
  date: string;
  strategyValue: number;
  buyHoldValue: number;
};

type Props = {
  series: ChartPoint[];
};

const WIDTH = 860;
const HEIGHT = 320;
const PAD_TOP = 20;
const PAD_RIGHT = 24;
const PAD_BOTTOM = 42;
const PAD_LEFT = 56;
const GRID_STEPS = 5;

const fmt = (n: number): string => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtAxis = (n: number): string => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

const xForIndex = (index: number, length: number): number => {
  if (length <= 1) return PAD_LEFT + plotWidth / 2;
  return PAD_LEFT + (index / (length - 1)) * plotWidth;
};

const yForValue = (value: number, min: number, max: number): number => {
  const yRange = Math.max(1e-9, max - min);
  return HEIGHT - PAD_BOTTOM - ((value - min) / yRange) * plotHeight;
};

const toSvgPath = (
  points: ChartPoint[],
  selector: (point: ChartPoint) => number,
  min: number,
  max: number,
): string =>
  points
    .map((point, index) => {
      const x = xForIndex(index, points.length);
      const y = yForValue(selector(point), min, max);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

export function PerformanceChart({ series }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (series.length === 0) {
      return {
        min: 0,
        max: 1,
        strategyPath: '',
        buyHoldPath: '',
        yTicks: [] as Array<{ value: number; y: number }>,
        xTicks: [] as Array<{ index: number; x: number; label: string }>,
      };
    }

    const allValues = series.flatMap((point) => [point.strategyValue, point.buyHoldValue]);
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const padding = Math.max(1, (rawMax - rawMin) * 0.08);
    const min = Math.max(0, rawMin - padding);
    const max = rawMax + padding;
    const xTickCount = Math.min(6, series.length);
    const xTickIndexes = Array.from(
      new Set(
        Array.from({ length: xTickCount }, (_, index) =>
          xTickCount === 1 ? 0 : Math.round((index * (series.length - 1)) / (xTickCount - 1)),
        ),
      ),
    );
    const labelFormat = series.length > 260 ? 'MMM yyyy' : 'MMM d, yyyy';

    return {
      min,
      max,
      strategyPath: toSvgPath(series, (point) => point.strategyValue, min, max),
      buyHoldPath: toSvgPath(series, (point) => point.buyHoldValue, min, max),
      yTicks: Array.from({ length: GRID_STEPS }, (_, index) => {
        const value = max - ((max - min) * index) / (GRID_STEPS - 1);
        return {
          value,
          y: yForValue(value, min, max),
        };
      }),
      xTicks: xTickIndexes.map((index) => ({
        index,
        x: xForIndex(index, series.length),
        label: format(parseISO(series[index].date), labelFormat),
      })),
    };
  }, [series]);

  const activeIndex = hoverIndex ?? Math.max(series.length - 1, 0);
  const activePoint = series[activeIndex];
  const activeX = xForIndex(activeIndex, series.length);
  const strategyY = activePoint ? yForValue(activePoint.strategyValue, chart.min, chart.max) : PAD_TOP;
  const buyHoldY = activePoint ? yForValue(activePoint.buyHoldValue, chart.min, chart.max) : PAD_TOP;

  if (series.length === 0) {
    return (
      <div className="card">
        <p className="small" style={{ margin: 0 }}>No chart data in the selected range.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="chart-meta">
        <div>
          <p className="small" style={{ margin: 0 }}>Hover the chart to inspect the selected date.</p>
        </div>
        <p className="small" style={{ margin: 0 }}>
          <strong>{format(parseISO(activePoint.date), 'MMM d, yyyy')}</strong>
          {' | '}
          <strong style={{ color: '#2e7d32' }}>Phoenix 9Sig:</strong> {fmt(activePoint.strategyValue)}
          {' | '}
          <strong style={{ color: '#b57600' }}>Buy &amp; hold:</strong> {fmt(activePoint.buyHoldValue)}
        </p>
      </div>

      <div className="card chart-card">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Strategy and buy and hold equity chart"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH;
            const relativeX = Math.min(Math.max(svgX - PAD_LEFT, 0), plotWidth);
            const nextIndex = series.length <= 1 ? 0 : Math.round((relativeX / plotWidth) * (series.length - 1));
            setHoverIndex(nextIndex);
          }}
        >
          {chart.yTicks.map((tick) => (
            <g key={tick.value}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={tick.y} y2={tick.y} stroke="#eadfca" strokeDasharray="4 4" />
              <text x={PAD_LEFT - 10} y={tick.y + 4} fontSize="11" fill="#6e6451" textAnchor="end">
                {fmtAxis(tick.value)}
              </text>
            </g>
          ))}
          {chart.xTicks.map((tick) => (
            <g key={tick.index}>
              <line x1={tick.x} x2={tick.x} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM + 6} stroke="#b9aa8f" />
              <text x={tick.x} y={HEIGHT - 12} fontSize="11" fill="#6e6451" textAnchor="middle">
                {tick.label}
              </text>
            </g>
          ))}
          <line x1={PAD_LEFT} x2={PAD_LEFT} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="#b9aa8f" />
          <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM} stroke="#b9aa8f" />
          <path d={chart.buyHoldPath} fill="none" stroke="#b57600" strokeWidth="2" />
          <path d={chart.strategyPath} fill="none" stroke="#2e7d32" strokeWidth="2.5" />
          <line x1={activeX} x2={activeX} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="#a39174" strokeDasharray="4 4" />
          <circle cx={activeX} cy={strategyY} r="4.5" fill="#2e7d32" />
          <circle cx={activeX} cy={buyHoldY} r="4.5" fill="#b57600" />
        </svg>
      </div>

      <p className="small" style={{ marginTop: '.5rem' }}>
        <strong style={{ color: '#2e7d32' }}>Phoenix 9Sig:</strong> {fmt(series[0].strategyValue)} {'->'} {fmt(series[series.length - 1].strategyValue)}
        {' | '}
        <strong style={{ color: '#b57600' }}>Buy &amp; hold (TQQQ):</strong> {fmt(series[0].buyHoldValue)} {'->'} {fmt(series[series.length - 1].buyHoldValue)}
      </p>
    </div>
  );
}
