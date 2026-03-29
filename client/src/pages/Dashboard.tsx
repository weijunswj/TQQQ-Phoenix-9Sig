import { useCallback } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { getLoginUrl } from '../const';
import { StrategyDashboard } from '../components/StrategyDashboard';
import { TelegramConnectionControls } from '../components/TelegramConnectionControls';

const STRATEGY_RULE_SECTIONS = [
  {
    title: '1. Initial Allocation ( Only Initially, This Is Not Maintained )',
    rows: [
      ['Start', '90% TQQQ / 10% Defensive'],
      ['Defensive Sleeve', 'Cash until SGOV data exists, then SGOV'],
    ],
  },
  {
    title: '2. Quarterly Rebalance ( Jan / Apr / Jul / Oct )',
    rows: [
      ['Execution Basis', 'Rebalance calculations use the same-day market open prices from the dataset on the rebalance date'],
      ['Target', '15% target = Last quarter TQQQ balance x 1.15 ( updated quarterly )'],
      ['If Above', 'Sell excess down to 15% target -> Move excess to Defensive sleeve'],
      ['If Below', 'Draw funds from Defensive sleeve to 15% target'],
      ['Buy Cap', 'If Defensive sleeve does not have enough, buy as much as possible -> Can end at 100% TQQQ'],
      ['ATH DD', 'If TQQQ closing price < 70% of the highest closing price over the last 315 trading days ( ~5 quarters ) -> Skip TQQQ SELLS for 126 trading days ( ~2 quarters )'],
      ['ATH DD Refresh', 'The 126-day skip window refreshes daily if condition persists'],
      ['FLOOR', 'If TQQQ < 60% portfolio, reset to 60/40 TQQQ / Defensive allocation ( enforced only at quarterly rebalance )'],
      ['Final Step', 'The 15% next-quarter target is calculated last, after all rebalance adjustments are made'],
    ],
  },
] as const;

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const strategyQuery = trpc.strategy.current.useQuery(undefined, { staleTime: 60_000 });
  const backtestQuery = trpc.strategy.backtest.useQuery(undefined, { staleTime: 60_000 });
  const telegramQuery = trpc.telegram.status.useQuery(undefined, { staleTime: 30_000 });

  const handleRefreshNeeded = useCallback(() => {
    utils.strategy.current.invalidate();
    utils.strategy.backtest.invalidate();
  }, [utils]);

  const handleConnected = useCallback(() => {
    utils.telegram.status.invalidate();
  }, [utils]);

  const handleDisconnected = useCallback(() => {
    utils.telegram.status.invalidate();
  }, [utils]);

  const isLoading = strategyQuery.isLoading || backtestQuery.isLoading;
  const isError = strategyQuery.isError || backtestQuery.isError;

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <h1>PhoenixSig ( Shares-Only )</h1>
          <p className="small">Quarterly rebalance model with a 15% next-quarter TQQQ target, ATH drawdown sell-skip, and floor reset controls.</p>
        </div>
        <TelegramConnectionControls
          botConfigured={telegramQuery.data?.botConfigured ?? false}
          connectUrl={telegramQuery.data?.connectUrl ?? null}
          initiallyConnected={telegramQuery.data?.connected ?? false}
          isAuthenticated={isAuthenticated}
          signInUrl={getLoginUrl()}
          onConnected={handleConnected}
          onDisconnected={handleDisconnected}
        />
      </section>

      {isLoading && (
        <section>
          <p className="small">Loading strategy data…</p>
        </section>
      )}

      {isError && (
        <section>
          <p className="small" style={{ color: 'var(--negative)' }}>
            Failed to load strategy data. Please refresh the page.
          </p>
        </section>
      )}

      {!isLoading && !isError && strategyQuery.data && backtestQuery.data && (
        <StrategyDashboard
          current={strategyQuery.data.current}
          backtest={backtestQuery.data.backtest}
          staleMarketData={strategyQuery.data.staleMarketData}
          nextRetryAtMs={strategyQuery.data.nextRetryAtMs}
          onRefreshNeeded={handleRefreshNeeded}
        />
      )}

      <section>
        <h2>Full Strategy Rules</h2>
        <p className="small" style={{ marginBottom: '.35rem' }}>Same rules, just rewritten in the compact table style.</p>
        <div className="rules-board">
          {STRATEGY_RULE_SECTIONS.map((section) => (
            <table className="rules-table" key={section.title}>
              <thead>
                <tr>
                  <th colSpan={2}>{section.title}</th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map(([label, detail]) => (
                  <tr key={`${section.title}-${label}`}>
                    <td className="rules-label">{label}</td>
                    <td className="rules-detail">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>

      <section>
        <h2>Disclaimer &amp; FAQ</h2>
        <ul>
          <li>This is a model strategy signal service only, not financial advice.</li>
          <li>Signals are generated from Yahoo Finance market data, and PhoenixSig uses same-day market open prices from that dataset for rebalance calculations.</li>
          <li>Actual broker fills can differ from the dataset open price and from the model output.</li>
          <li>All alerts are based on a fixed $10,000 model portfolio and are not personalised to individual users.</li>
        </ul>
      </section>
    </main>
  );
}
