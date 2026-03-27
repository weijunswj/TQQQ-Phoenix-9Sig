import { getStrategyPayloads } from '@/lib/strategy/service';
import { telegramDeepLink } from '@/lib/telegram/client';

const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function HomePage() {
  const { current, backtest } = await getStrategyPayloads();
  const latestEvents = backtest.rebalanceLog.slice(-10).reverse();

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
          <span className={`badge ${current.ruleState.athDdActive ? 'warn' : 'good'}`}>ATH DD: {String(current.ruleState.athDdActive)}</span>
          <span className={`badge ${current.ruleState.floorTriggered ? 'warn' : 'good'}`}>Floor: {String(current.ruleState.floorTriggered)}</span>
          <span className="badge warn">Skip sell days: {current.ruleState.skipSellDaysRemaining}</span>
        </p>
      </section>

      <section>
        <h2>Backtest summary ( $10,000 model )</h2>
        <div className="grid">
          <div className="card"><strong>Final value</strong><br />{fmt(backtest.metrics.finalValue)}</div>
          <div className="card"><strong>CAGR</strong><br />{backtest.metrics.cagr}%</div>
          <div className="card"><strong>Max drawdown</strong><br />{backtest.metrics.maxDrawdown}%</div>
          <div className="card"><strong>Rebalances</strong><br />{backtest.metrics.rebalanceCount}</div>
        </div>
        <p className="small">API endpoints: <code>/api/strategy/current</code> and <code>/api/strategy/backtest</code>.</p>
      </section>

      <section>
        <h2>Historical trade log</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Action</th><th>TQQQ</th><th>Defensive</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {latestEvents.map((event) => (
              <tr key={`${event.date}-${event.action}`}>
                <td>{event.date}</td>
                <td>{event.action}</td>
                <td>{fmt(event.tqqqTradeDollars)}</td>
                <td>{fmt(event.defensiveTradeDollars)}</td>
                <td>{event.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
