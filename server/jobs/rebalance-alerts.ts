import { getStrategyPayloads } from '../strategy/service.js';
import { hasSentAlertKey, listActiveSubscribers, markAlertKeySent } from '../telegram/store.js';
import { sendTelegramMessage } from '../telegram/client.js';

type RebalanceAlertsJobContext = {
  evaluatedAsOfDate: string | null;
  latestRebalanceDate: string | null;
  recipientChatIds: string[];
};

type RebalanceAlertsJobBody =
  | ({ ok: true; skipped: string } & RebalanceAlertsJobContext)
  | ({ ok: true; sent: number; failed: string[]; alertKey: string } & RebalanceAlertsJobContext)
  | ({ ok: false; error: string; failed?: string[]; alertKey?: string } & RebalanceAlertsJobContext);

export type RebalanceAlertsJobResult = {
  status: number;
  body: RebalanceAlertsJobBody;
};

export async function runRebalanceAlertsJob(jobKey: string | null | undefined): Promise<RebalanceAlertsJobResult> {
  const secret = process.env.JOB_RUNNER_SECRET?.trim();
  const providedKey = jobKey?.trim();
  if (!secret || providedKey !== secret) {
    return {
      status: 401,
      body: { ok: false, error: 'Invalid job key.', evaluatedAsOfDate: null, latestRebalanceDate: null, recipientChatIds: [] },
    };
  }

  const { backtest, current } = await getStrategyPayloads();
  const event = current.currentRebalanceEvent ?? backtest.rebalanceLog[backtest.rebalanceLog.length - 1];
  const context: RebalanceAlertsJobContext = {
    evaluatedAsOfDate: current.asOfDate,
    latestRebalanceDate: event?.date ?? null,
    recipientChatIds: [],
  };

  if (!event) {
    return { status: 200, body: { ok: true, skipped: 'No rebalance event.', ...context } };
  }

  if (event.date !== current.asOfDate) {
    return {
      status: 200,
      body: {
        ok: true,
        skipped: `Latest rebalance event is not due for today ( latest rebalance ${event.date}, evaluated as-of ${current.asOfDate} ).`,
        ...context,
      },
    };
  }

  const alertKey = `${event.date}-${event.action}-${event.tqqqTradeDollars}`;
  if (await hasSentAlertKey(alertKey)) {
    return { status: 200, body: { ok: true, skipped: 'Already sent.', ...context } };
  }

  const subscribers = await listActiveSubscribers();
  const recipientChatIds = subscribers.map((subscriber) => subscriber.chatId);
  if (subscribers.length === 0) {
    return { status: 200, body: { ok: true, skipped: 'No active subscribers.', ...context } };
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
        ...context,
        recipientChatIds,
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
      ...context,
      recipientChatIds,
    },
  };
}
