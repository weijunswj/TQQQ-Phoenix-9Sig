import { getStrategyPayloads } from '@/lib/strategy/service';
import { telegramDeepLink } from '@/lib/telegram/client';
import { StrategyDashboard } from './components/strategy-dashboard';

export default async function HomePage() {
  const { current, backtest } = await getStrategyPayloads();

  return (
    <main>
      <section className="hero">
        <div>
          <h1>🔥 Phoenix 9Sig ( Shares-only )</h1>
          <p className="small">Quarterly rebalance model with ATH drawdown sell-skip and floor reset controls.</p>
        </div>
        <a className="cta" href={telegramDeepLink()} target="_blank" rel="noreferrer">Subscribe on Telegram</a>
      </section>

      <StrategyDashboard current={current} backtest={backtest} />

      <section>
        <h2>Full strategy rules</h2>
        <ol>
          <li>The strategy only trades on the first US business day of January, April, July, and October, and it uses that day&apos;s open prices for every rebalance calculation. On all other trading days, it does nothing.</li>
          <li>The portfolio starts at 90% TQQQ and 10% defensive. The defensive sleeve stays in cash until SGOV price data exists, then the defensive sleeve is held in SGOV.</li>
          <li>Every trading day, the strategy tracks a rolling 315-trading-day all-time-high window using TQQQ closing prices. This 315-day lookback rolls forward one trading day at a time.</li>
          <li>If the current TQQQ close falls below 70% of that rolling 315-trading-day closing ATH, the sell-skip guard turns on or refreshes. From that day, TQQQ sell signals are blocked for 126 trading days, and the 126-day clock resets every day that the same below-70% condition is still true.</li>
          <li>On a rebalance day, the strategy first values the current TQQQ sleeve and the defensive sleeve at the open. If TQQQ is below 60% of total portfolio value, the floor rule overrides the normal target and resets the rebalance target to exactly 60% TQQQ and 40% defensive.</li>
          <li>If the floor rule does not override the target, the rebalance uses the stored TQQQ target carried forward from the prior quarter.</li>
          <li>If the target requires selling TQQQ while the sell-skip guard is active, that sell is cancelled and no TQQQ is sold. If the target requires buying TQQQ, the purchase is limited by whatever value is currently in the defensive sleeve. If the defensive sleeve cannot fully fund the buy, the strategy buys as much TQQQ as possible and can finish at 100% TQQQ.</li>
          <li>After all rebalance adjustments are finished, the next quarter&apos;s TQQQ target is set to 109% of the final post-rebalance TQQQ sleeve value. This 9% step is always calculated last, after the floor rule, sell-skip guard, and any buy-size cap have already been applied.</li>
          <li>Outside those scheduled rebalance dates, the strategy never opens, closes, trims, or adds to a position.</li>
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
