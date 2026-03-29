import { getStrategyPayloads } from '../strategy/service.js';
import { hasSentAlertKey, listActiveSubscribers, markAlertKeySent } from '../telegram/store.js';
import { sendTelegramMessage } from '../telegram/client.js';

type RebalanceAlertsJobBody =
  | { ok: true; skipped: string }
  | { ok: true; sent: number; failed: string[]; alertKey: string }
  | { ok: false; error: string; failed?: string[]; alertKey?: string };

export type RebalanceAlertsJobResult = {
  status: number;
  body: RebalanceAlertsJobBody;
};

export async function runRebalanceAlertsJob(jobKey: string | null | undefined): Promise<RebalanceAlertsJobResult> {
  const secret = process.env.JOB_RUNNER_SECRET;
  if (!secret || jobKey !== secret) {
    return {
      status: 401,
      body: { ok: false, error: 'Invalid job key.' },
    };
  }

  const { backtest, current } = await getStrategyPayloads();
  const event = backtest.rebalanceLog[backtest.rebalanceLog.length - 1];

  if (!event) {
    return { status: 200, body: { ok: true, skipped: 'No rebalance event.' } };
  }

  if (event.date !== current.asOfDate) {
    return { status: 200, body: { ok: true, skipped: 'Latest rebalance event is not due for today.' } };
  }

  const alertKey = `${event.date}-${event.action}-${event.tqqqTradeDollars}`;
  if (await hasSentAlertKey(alertKey)) {
    return { status: 200, body: { ok: true, skipped: 'Already sent.' } };
  }

  const subscribers = await listActiveSubscribers();
  if (subscribers.length === 0) {
    return { status: 200, body: { ok: true, skipped: 'No active subscribers.' } };
  }

  const actionEmoji: Record<string, string> = {
    buy_tqqq: '🟢',
    sell_tqqq: '🔴',
    hold: '⚪',
  };
  const emoji = actionEmoji[event.action] ?? '📊';
  const message = [
    `${emoji} PhoenixSig Quarterly Rebalance`,
    `Date: ${event.date}`,
    `Action: ${event.action.replace('_', ' ').toUpperCase()}`,
    `TQQQ trade: $${event.tqqqTradeDollars.toFixed(2)}`,
    `Defensive trade: $${event.defensiveTradeDollars.toFixed(2)}`,
    `TQQQ value: $${event.tqqqValue.toFixed(2)} (${event.tqqqWeight.toFixed(1)}%)`,
    `Defensive value: $${event.defensiveValue.toFixed(2)} (${event.defensiveWeight.toFixed(1)}%)`,
    event.reason,
  ].join('\n');

  const sendResults = await Promise.allSettled(
    subscribers.map((subscriber) => sendTelegramMessage(subscriber.chatId, message)),
  );
  const failed = sendResults
    .map((result, index) => (result.status === 'rejected' ? subscribers[index].chatId : null))
    .filter((chatId): chatId is string => chatId !== null);

  if (failed.length === subscribers.length) {
    return {
      status: 502,
      body: {
        ok: false,
        error: `Failed to send to all ${subscribers.length} subscribers.`,
        failed,
        alertKey,
      },
    };
  }

  await markAlertKeySent(alertKey);

  return {
    status: 200,
    body: {
      ok: true,
      sent: subscribers.length - failed.length,
      failed,
      alertKey,
    },
  };
}
