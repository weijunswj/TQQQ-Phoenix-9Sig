import { NextResponse } from 'next/server';
import { hasSentAlertKey, listActiveSubscribers, markAlertKeySent } from '@/lib/db/store';
import { getStrategyPayloads } from '@/lib/strategy/service';
import { sendTelegramMessage } from '@/lib/telegram/client';

const unauthorised = () => NextResponse.json({ ok: false, error: 'Unauthorised' }, { status: 401 });

export async function POST(req: Request) {
  const key = req.headers.get('x-job-key');
  if (!process.env.JOB_RUNNER_SECRET || key !== process.env.JOB_RUNNER_SECRET) return unauthorised();

  const { backtest } = await getStrategyPayloads();
  const event = backtest.rebalanceLog[backtest.rebalanceLog.length - 1];
  if (!event) return NextResponse.json({ ok: true, skipped: 'No rebalance event.' });

  const alertKey = `${event.date}-${event.action}-${event.tqqqTradeDollars}`;
  if (await hasSentAlertKey(alertKey)) {
    return NextResponse.json({ ok: true, skipped: 'Already sent.' });
  }

  const subscribers = await listActiveSubscribers();
  const message = [
    'PhoenixSig rebalance update',
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
