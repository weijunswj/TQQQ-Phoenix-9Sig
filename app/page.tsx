import { getStrategyPayloads } from '@/lib/strategy/service';
import { telegramDeepLink } from '@/lib/telegram/client';
import { DailyRefreshCountdown } from './components/daily-refresh-countdown';
import { PerformanceChart } from './components/performance-chart';

const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const numOr = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

export default async function HomePage() {
  const { current, backtest } = await getStrategyPayloads();
  const latestEvents = backtest.rebalanceLog.slice(-20).reverse();
  const athPct = numOr(current.ruleState?.pctFromAth, 0);
  const latestClose = numOr(current.ruleState?.latestClose, 0);
  const athClose = numOr(current.ruleState?.trailingAthClose, latestClose);

  return (
    <main>
      <section className="hero">
        <div>
          <h1>🔥 Phoenix 9Sig ( Shares-only )</h1>
          <p className="small">Quarterly rebalance model with ATH drawdown sell-skip and floor reset controls.</p>
        </div>
        <a className="cta" href={telegramDeepLink()} target="_blank" rel="noreferrer">Subscribe on Telegram</a>
      </section>

      <section>
        <h2>Current status</h2>
        <div className="grid">
          <div className="card"><strong>As of</strong><br />{current.asOfDate}</div>
          <div className="card"><strong>Portfolio</strong><br />{fmt(current.portfolioValue)}</div>
          <div className="card"><strong>Next rebalance</strong><br />{current.nextRebalanceDate}</div>
          <div className="card"><strong>Action</strong><br />{current.action}</div>
        </div>
        <p>
          <span className={`badge ${current.ruleState.athDdActive ? 'warn' : 'good'}`}>
            ATH DD: {pct(athPct)} (Close {fmt(latestClose)} vs ATH {fmt(athClose)})
          </span>
          <span className={`badge ${current.ruleState.floorTriggered ? 'warn' : 'good'}`}>Floor: {String(current.ruleState.floorTriggered)}</span>
          <span className={`badge ${current.ruleState.skipSellDaysRemaining > 0 ? 'warn' : 'good'}`}>
            Skip sell days: {current.ruleState.skipSellDaysRemaining > 0 ? `${current.ruleState.skipSellDaysRemaining} days` : 'NA'}
          </span>
        </p>
        <DailyRefreshCountdown />
      </section>

      <section>
        <h2>Backtest summary ( $10,000 model )</h2>
        <div className="grid">
          <div className="card"><strong>Final value</strong><br />{fmt(backtest.metrics.finalValue)}</div>
          <div className="card"><strong>CAGR</strong><br />{backtest.metrics.cagr}%</div>
          <div className="card"><strong>Max drawdown</strong><br />{backtest.metrics.maxDrawdown}%</div>
          <div className="card"><strong>Rebalances</strong><br />{backtest.metrics.rebalanceCount}</div>
        </div>
        <h3>Equity curve vs buy & hold</h3>
        <PerformanceChart strategySeries={backtest.equityCurve} buyHoldSeries={backtest.benchmark.tqqqBuyAndHold} />
      </section>

      <section>
        <h2>Historical trade log</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Action</th><th>TQQQ</th><th>Defensive</th><th>Guard checks</th><th>Defensive asset</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {latestEvents.map((event) => (
              <tr key={`${event.date}-${event.action}`}>
                <td>{event.date}</td>
                <td>{event.action}</td>
                <td>{fmt(event.tqqqTradeDollars)}</td>
                <td>{fmt(event.defensiveTradeDollars)}</td>
                <td>{event.guardSummary}</td>
                <td>{event.defensiveAsset}</td>
                <td>{event.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Full strategy rules</h2>
        <ol>
          <li>Portfolio starts with 90% TQQQ and 10% defensive sleeve (moved to SGOV as soon as SGOV prices are available).</li>
          <li>Rebalance only on the first business day of each quarter.</li>
          <li>After each rebalance, next TQQQ target is set to 109% of the newly rebalanced TQQQ sleeve.</li>
          <li>If TQQQ falls below 70% of its trailing ATH close, sell signals are blocked for 126 market days (skip-sell window).</li>
          <li>If TQQQ sleeve falls below 60% of portfolio at rebalance, floor rule resets target to exactly 60% TQQQ.</li>
          <li>Outside scheduled rebalance dates, no trade is executed.</li>
        </ol>
      </section>

      <section>
        <h2>Disclaimer & FAQ</h2>
        <ul>
          <li>This is a model strategy signal service only, not financial advice.</li>
          <li>Signals are generated from Yahoo Finance market data and can differ from broker execution prices.</li>
          <li>Alerts are fixed to a $10,000 model portfolio in v1 and are not personalised.</li>
        </ul>
      </section>
    </main>
  );
}
