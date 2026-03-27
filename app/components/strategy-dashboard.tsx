'use client';

import { differenceInCalendarDays, format, parseISO, startOfDay, subMonths, subYears } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { StrategyBacktest, StrategySnapshot } from '@/lib/strategy/types';
import { DailyRefreshCountdown } from './daily-refresh-countdown';
import { PerformanceChart, type ChartPoint } from './performance-chart';

type Props = {
  current: StrategySnapshot;
  backtest: StrategyBacktest;
};

type Range = '3m' | '6m' | '1y' | '3y' | '5y' | 'all' | 'custom';
type TradeLogRow = {
  id: string;
  date: string;
  actionLabel: string;
  tqqqTradeDollars: number;
  tqqqValue: number;
  defensiveValue: number;
  reason: string;
  guardSummary: string;
};

const alignBenchmarkToCurve = (
  curve: StrategyBacktest['equityCurve'],
  benchmark: Array<{ date: string; value: number }>,
): number[] => {
  const fallback = benchmark[0]?.value ?? curve[0]?.value ?? 0;
  let benchmarkIndex = 0;
  let lastKnownValue = fallback;

  return curve.map((point) => {
    while (benchmarkIndex + 1 < benchmark.length && benchmark[benchmarkIndex + 1].date <= point.date) {
      benchmarkIndex += 1;
    }

    const benchmarkPoint = benchmark[benchmarkIndex];
    if (benchmarkPoint && benchmarkPoint.date <= point.date) {
      lastKnownValue = benchmarkPoint.value;
    }

    return lastKnownValue;
  });
};

const fmtCurrency = (n: number): string => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtPercent = (n: number): string => `${n.toFixed(2)}%`;

const cutoffForRange = (range: Exclude<Range, 'custom'>, endDate: Date): Date | null => {
  if (range === 'all') return null;
  if (range === '3m') return subMonths(endDate, 3);
  if (range === '6m') return subMonths(endDate, 6);
  if (range === '1y') return subYears(endDate, 1);
  if (range === '3y') return subYears(endDate, 3);
  return subYears(endDate, 5);
};

const clampDate = (date: string, minDate: string, maxDate: string): string => {
  if (!date) return minDate;
  if (date < minDate) return minDate;
  if (date > maxDate) return maxDate;
  return date;
};

const actionLabel = (action: string): string => {
  if (action === 'buy_tqqq') return 'Buy TQQQ';
  if (action === 'sell_tqqq') return 'Sell TQQQ';
  return 'Hold';
};

export function StrategyDashboard({ current, backtest }: Props) {
  const chartPoints = useMemo<ChartPoint[]>(
    () => {
      const tqqqBuyHold = alignBenchmarkToCurve(backtest.equityCurve, backtest.benchmark.tqqqBuyAndHold);

      return backtest.equityCurve.map((point, index) => ({
        date: point.date,
        strategyValue: point.value,
        buyHoldValue: tqqqBuyHold[index] ?? point.value,
      }));
    },
    [backtest.benchmark.tqqqBuyAndHold, backtest.equityCurve],
  );

  const minDate = chartPoints[0]?.date ?? current.asOfDate;
  const maxDate = chartPoints[chartPoints.length - 1]?.date ?? current.asOfDate;
  const [range, setRange] = useState<Range>('all');
  const [startDate, setStartDate] = useState(minDate);
  const [endDate, setEndDate] = useState(maxDate);
  const [today, setToday] = useState(() => startOfDay(new Date(current.marketTimestamp)));

  useEffect(() => {
    setToday(startOfDay(new Date()));

    const timer = setInterval(() => {
      setToday(startOfDay(new Date()));
    }, 60_000);

    return () => clearInterval(timer);
  }, []);

  const applyPreset = (nextRange: Exclude<Range, 'custom'>) => {
    const end = parseISO(maxDate);
    const cutoff = cutoffForRange(nextRange, end);
    const nextStart = cutoff ? clampDate(format(cutoff, 'yyyy-MM-dd'), minDate, maxDate) : minDate;

    setRange(nextRange);
    setStartDate(nextStart);
    setEndDate(maxDate);
  };

  const normalizedStart = startDate <= endDate ? startDate : endDate;
  const normalizedEnd = endDate >= startDate ? endDate : startDate;

  const filteredChartPoints = useMemo(
    () => chartPoints.filter((point) => point.date >= normalizedStart && point.date <= normalizedEnd),
    [chartPoints, normalizedEnd, normalizedStart],
  );

  const filteredEvents = useMemo(
    () => backtest.rebalanceLog.filter((event) => event.date >= normalizedStart && event.date <= normalizedEnd),
    [backtest.rebalanceLog, normalizedEnd, normalizedStart],
  );

  const tradeLogRows = useMemo<TradeLogRow[]>(() => {
    const rows: TradeLogRow[] = filteredEvents.map((event, index) => ({
      id: `${event.date}-${event.action}-${index}`,
      date: event.date,
      actionLabel: actionLabel(event.action),
      tqqqTradeDollars: event.tqqqTradeDollars,
      tqqqValue: event.tqqqValue,
      defensiveValue: event.defensiveValue,
      reason: event.reason,
      guardSummary: event.guardSummary,
    }));

    if (backtest.initialState.date >= normalizedStart && backtest.initialState.date <= normalizedEnd) {
      rows.unshift({
        id: `init-${backtest.initialState.date}`,
        date: backtest.initialState.date,
        actionLabel: 'Initialize',
        tqqqTradeDollars: backtest.initialState.tqqqTradeDollars,
        tqqqValue: backtest.initialState.tqqqValue,
        defensiveValue: backtest.initialState.defensiveValue,
        reason: 'Strategy initialized at 90% TQQQ / 10% defensive.',
        guardSummary: `skipSellActive=false; floorTriggered=false; defensiveAsset=${backtest.initialState.defensiveAsset}`,
      });
    }

    return rows.slice().reverse();
  }, [backtest.initialState, filteredEvents, normalizedEnd, normalizedStart]);

  const athPct = Math.max(0, 100 + current.ruleState.pctFromAth);
  const tqqqRatio = current.portfolioValue > 0 ? (current.tqqqValue / current.portfolioValue) * 100 : 0;
  const defensiveRatio = current.portfolioValue > 0 ? (current.defensiveValue / current.portfolioValue) * 100 : 0;
  const defensiveLabel = current.defensiveAsset === 'SGOV' ? 'SGOV' : 'Cash';
  const rebalanceDaysRemaining = Math.max(0, differenceInCalendarDays(parseISO(current.nextRebalanceDate), today));
  const visibleStart = filteredChartPoints[0]?.date ?? normalizedStart;
  const visibleEnd = filteredChartPoints[filteredChartPoints.length - 1]?.date ?? normalizedEnd;

  return (
    <>
      <section>
        <h2>Current status</h2>
        <DailyRefreshCountdown initialNowMs={current.marketTimestamp} />
        <p className="small" style={{ marginTop: '.2rem', marginBottom: '.75rem' }}>
          Days until next rebalance: <strong>{rebalanceDaysRemaining}</strong> {rebalanceDaysRemaining === 1 ? 'day' : 'days'}
        </p>
        <div className="grid">
          <div className="card">
            <strong>As of</strong>
            <br />
            {current.asOfDate}
          </div>
          <div className="card">
            <strong>Portfolio</strong>
            <br />
            {fmtCurrency(current.portfolioValue)}
          </div>
          <div className="card">
            <strong>TQQQ sleeve</strong>
            <br />
            {fmtCurrency(current.tqqqValue)} ({fmtPercent(tqqqRatio)})
          </div>
          <div className="card">
            <strong>{defensiveLabel} sleeve</strong>
            <br />
            {fmtCurrency(current.defensiveValue)} ({fmtPercent(defensiveRatio)})
          </div>
          <div className="card">
            <strong>Next rebalance</strong>
            <br />
            {current.nextRebalanceDate}
          </div>
          <div className="card">
            <strong>Action</strong>
            <br />
            {current.action}
          </div>
        </div>
        <p>
          <span className={`badge ${current.ruleState.athDdActive ? 'warn' : 'good'}`}>
            ATH DD: {fmtPercent(athPct)} of ATH (Close {fmtCurrency(current.ruleState.latestClose)} vs ATH {fmtCurrency(current.ruleState.trailingAthClose)})
            {current.ruleState.skipSellDaysRemaining > 0 ? (
              <>
                {' | '}
                <strong>Skip sell days: {current.ruleState.skipSellDaysRemaining}</strong>
              </>
            ) : null}
          </span>
          <span className={`badge ${current.ruleState.floorTriggered ? 'warn' : 'good'}`}>
            Floor: {String(current.ruleState.floorTriggered)} (TQQQ {fmtPercent(tqqqRatio)} / {defensiveLabel} {fmtPercent(defensiveRatio)})
          </span>
        </p>
      </section>

      <section>
        <div className="section-header">
          <div>
            <h2>Backtest summary ( $10,000 model )</h2>
            <p className="small">Summary cards cover the finalized PhoenixSig strategy with a 15% next-quarter TQQQ target. The date controls below change the chart and historical trade log.</p>
          </div>
        </div>

        <div className="summary-block">
          <h3>PhoenixSig</h3>
          <div className="grid">
            <div className="card">
              <strong>Final value</strong>
              <br />
              {fmtCurrency(backtest.metrics.finalValue)}
            </div>
            <div className="card">
              <strong>CAGR</strong>
              <br />
              {fmtPercent(backtest.metrics.cagr)}
            </div>
            <div className="card">
              <strong>Max drawdown</strong>
              <br />
              {fmtPercent(backtest.metrics.maxDrawdown)}
            </div>
            <div className="card">
              <strong>Rebalances</strong>
              <br />
              {backtest.metrics.rebalanceCount}
            </div>
          </div>
        </div>

        <div className="summary-block">
          <h3>Buy &amp; hold ( TQQQ )</h3>
          <div className="grid">
            <div className="card">
              <strong>Final value</strong>
              <br />
              {fmtCurrency(backtest.metrics.buyHoldFinalValue)}
            </div>
            <div className="card">
              <strong>CAGR</strong>
              <br />
              {fmtPercent(backtest.metrics.buyHoldCagr)}
            </div>
            <div className="card">
              <strong>Max drawdown</strong>
              <br />
              {fmtPercent(backtest.metrics.buyHoldMaxDrawdown)}
            </div>
            <div className="card">
              <strong>Rebalances</strong>
              <br />
              0
            </div>
          </div>
        </div>

        <div className="range-controls">
          <label htmlFor="range-select">
            Range preset
            <select
              id="range-select"
              value={range}
              onChange={(event) => {
                const nextRange = event.target.value as Range;
                if (nextRange === 'custom') {
                  setRange('custom');
                  return;
                }
                applyPreset(nextRange);
              }}
            >
              <option value="3m">3M</option>
              <option value="6m">6M</option>
              <option value="1y">1Y</option>
              <option value="3y">3Y</option>
              <option value="5y">5Y</option>
              <option value="all">All</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label htmlFor="start-date">
            Start date
            <input
              id="start-date"
              type="date"
              min={minDate}
              max={maxDate}
              value={startDate}
              onChange={(event) => {
                setRange('custom');
                setStartDate(clampDate(event.target.value, minDate, maxDate));
              }}
            />
          </label>
          <label htmlFor="end-date">
            End date
            <input
              id="end-date"
              type="date"
              min={minDate}
              max={maxDate}
              value={endDate}
              onChange={(event) => {
                setRange('custom');
                setEndDate(clampDate(event.target.value, minDate, maxDate));
              }}
            />
          </label>
        </div>

        <p className="small">
          Showing chart and trade log from {format(parseISO(visibleStart), 'MMM d, yyyy')} to {format(parseISO(visibleEnd), 'MMM d, yyyy')}.
        </p>

        <h3>Equity curve vs buy &amp; hold</h3>
        <PerformanceChart series={filteredChartPoints} />
      </section>

      <section>
        <div className="section-header">
          <div>
            <h2>Historical trade log</h2>
            <p className="small">Showing {tradeLogRows.length} transactions in the selected date range.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>TQQQ trade</th>
                <th>TQQQ value</th>
                <th>Defensive value</th>
                <th>Reason</th>
                <th>Guard checks</th>
              </tr>
            </thead>
            <tbody>
              {tradeLogRows.length > 0 ? (
                tradeLogRows.map((row) => (
                  <tr key={row.id}>
                    <td className="nowrap">{row.date}</td>
                    <td>{row.actionLabel}</td>
                    <td>{fmtCurrency(row.tqqqTradeDollars)}</td>
                    <td>{fmtCurrency(row.tqqqValue)}</td>
                    <td>{fmtCurrency(row.defensiveValue)}</td>
                    <td>{row.reason}</td>
                    <td>{row.guardSummary}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-state" colSpan={7}>No transactions in the selected range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
