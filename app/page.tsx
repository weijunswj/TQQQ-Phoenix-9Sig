import { getStrategyPayloads } from '@/lib/strategy/service';
import { telegramDeepLink } from '@/lib/telegram/client';
import { StrategyDashboard } from './components/strategy-dashboard';

export const dynamic = 'force-dynamic';

const STRATEGY_RULE_SECTIONS = [
  {
    title: '1. Initial Allocation ( only initially, this is not maintained )',
    rows: [
      ['Start', '90% TQQQ / 10% Defensive'],
      ['Defensive sleeve', 'Cash until SGOV data exists, then SGOV'],
    ],
  },
  {
    title: '2. Quarterly rebalance ( Jan / Apr / Jul / Oct )',
    rows: [
      ['Target', '15% target = Last quarter TQQQ balance x 1.15 ( updated quarterly )'],
      ['If Above', 'Sell excess down to 15% target -> Move excess to Defensive sleeve'],
      ['If Below', 'Draw funds from Defensive sleeve to 15% target'],
      ['Buy cap', 'If Defensive sleeve does not have enough, buy as much as possible -> Can end at 100% TQQQ'],
      ['ATH DD', 'If TQQQ closing price < 70% of the highest closing price over the last 315 trading days (~5 quarters) -> Skip TQQQ SELLS for 126 trading days (~2 quarters)'],
      ['ATH DD refresh', 'The 126-day skip window refreshes daily if condition persists'],
      ['FLOOR', 'If TQQQ < 60% portfolio, reset to 60/40 TQQQ / Defensive allocation ( enforced only at quarterly rebalance )'],
      ['Final Step', 'The 15% next-quarter target is calculated last, after all rebalance adjustments are made'],
    ],
  },
] as const;

export default async function HomePage() {
  const { current, backtest } = await getStrategyPayloads();

  return (
    <main>
      <section className="hero">
        <div>
          <h1>PhoenixSig ( Shares-only )</h1>
          <p className="small">Quarterly rebalance model with a 15% next-quarter TQQQ target, ATH drawdown sell-skip, and floor reset controls.</p>
        </div>
        <a className="cta" href={telegramDeepLink()} target="_blank" rel="noreferrer">Subscribe on Telegram</a>
      </section>

      <StrategyDashboard current={current} backtest={backtest} />

      <section>
        <h2>Full strategy rules</h2>
        <p className="small">Same rules, just rewritten in the compact table style.</p>
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
