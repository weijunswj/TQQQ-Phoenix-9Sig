import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/jobs/rebalance-alerts/run/route';
import * as store from '@/lib/db/store';
import * as strategyService from '@/lib/strategy/service';
import * as telegramClient from '@/lib/telegram/client';

vi.mock('@/lib/db/store', () => ({
  hasSentAlertKey: vi.fn(),
  listActiveSubscribers: vi.fn(),
  markAlertKeySent: vi.fn(),
}));

vi.mock('@/lib/strategy/service', () => ({
  getStrategyPayloads: vi.fn(),
}));

vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: vi.fn(),
}));

describe('rebalance alert route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JOB_RUNNER_SECRET = 'test-secret';
  });

  it('rejects requests with the wrong job secret', async () => {
    const response = await POST(new Request('http://localhost/api/jobs/rebalance-alerts/run', {
      method: 'POST',
      headers: { 'x-job-key': 'wrong-secret' },
    }));

    expect(response.status).toBe(401);
  });

  it('skips when the latest rebalance event is not due on the current dataset date', async () => {
    vi.mocked(strategyService.getStrategyPayloads).mockResolvedValue({
      current: { asOfDate: '2026-03-27' },
      backtest: {
        rebalanceLog: [
          {
            date: '2026-01-02',
            action: 'hold',
            tqqqTradeDollars: 0,
            defensiveTradeDollars: 0,
            reason: 'No trade.',
          },
        ],
      },
    } as never);

    const response = await POST(new Request('http://localhost/api/jobs/rebalance-alerts/run', {
      method: 'POST',
      headers: { 'x-job-key': 'test-secret' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skipped).toMatch(/not due for today/i);
    expect(store.hasSentAlertKey).not.toHaveBeenCalled();
    expect(telegramClient.sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('sends alerts when the latest rebalance event matches the current dataset date', async () => {
    vi.mocked(strategyService.getStrategyPayloads).mockResolvedValue({
      current: { asOfDate: '2026-04-01' },
      backtest: {
        rebalanceLog: [
          {
            date: '2026-04-01',
            action: 'buy_tqqq',
            tqqqTradeDollars: 1250,
            defensiveTradeDollars: -1250,
            reason: 'Quarterly rebalance executed.',
          },
        ],
      },
    } as never);
    vi.mocked(store.hasSentAlertKey).mockResolvedValue(false);
    vi.mocked(store.listActiveSubscribers).mockResolvedValue([
      {
        chatId: '42',
        active: true,
        subscribedAt: '2026-03-29T00:00:00.000Z',
        unsubscribedAt: null,
      },
    ]);
    vi.mocked(telegramClient.sendTelegramMessage).mockResolvedValue();

    const response = await POST(new Request('http://localhost/api/jobs/rebalance-alerts/run', {
      method: 'POST',
      headers: { 'x-job-key': 'test-secret' },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(store.hasSentAlertKey).toHaveBeenCalledWith('2026-04-01-buy_tqqq-1250');
    expect(telegramClient.sendTelegramMessage).toHaveBeenCalledWith(
      '42',
      expect.stringContaining('PhoenixSig rebalance update'),
    );
    expect(store.markAlertKeySent).toHaveBeenCalledWith('2026-04-01-buy_tqqq-1250');
  });
});
