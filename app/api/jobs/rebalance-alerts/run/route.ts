import { NextResponse } from 'next/server';
import { getStrategyPayloads } from '@/lib/strategy/service';
import { hasSentAlertKey, listActiveSubscribers, markAlertKeySent } from '@/lib/db/store';
import { sendTelegramMessage } from '@/lib/telegram/client';

export async function POST() {
  const { backtest } = await getStrategyPayloads();
  const event = backtest.rebalanceLog[backtest.rebalanceLog.length - 1];
  if (!event) return NextResponse.json({ ok: true, skipped: 'No rebalance event.' });

  const alertKey = `${event.date}-${event.action}-${event.tqqqTradeDollars}`;
  if (await hasSentAlertKey(alertKey)) {
    return NextResponse.json({ ok: true, skipped: 'Already sent.' });
  }

  const subscribers = await listActiveSubscribers();
  const message = [
    '🔥 Phoenix 9Sig rebalance update',
    `Date: ${event.date}`,
    `Action: ${event.action}`,
    `TQQQ trade: $${event.tqqqTradeDollars.toFixed(2)}`,
    `Defensive trade: $${event.defensiveTradeDollars.toFixed(2)}`,
    `Reason: ${event.reason}`,
  ].join('\n');

  const sendResults = await Promise.allSettled(subscribers.map((s) => sendTelegramMessage(s.chatId, message)));
  const failed = sendResults
    .map((result, idx) => (result.status === 'rejected' ? subscribers[idx].chatId : null))
    .filter((chatId): chatId is string => chatId !== null);
  await markAlertKeySent(alertKey);

  return NextResponse.json({
    ok: true,
    sent: subscribers.length - failed.length,
    failed,
    alertKey,
  });
}
