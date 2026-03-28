import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendTelegramMessage, telegramDeepLink, telegramWebhookSecret } from '@/lib/telegram/client';

describe('telegram client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.TELEGRAM_BOT_TOKEN = '123:abc';
    process.env.TELEGRAM_BOT_USERNAME = 'phoenix9sig_bot';
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('retries retryable Telegram errors and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'temporary' })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await sendTelegramMessage('42', 'hello');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/sendMessage$/);
  });

  it('throws after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(sendTelegramMessage('42', 'hello')).rejects.toThrow(/502/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails fast on non-retryable API responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(sendTelegramMessage('42', 'hello')).rejects.toThrow(/403/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('builds deep link and returns optional webhook secret', () => {
    process.env.TELEGRAM_BOT_USERNAME = ' phoenix9sig_bot ';
    process.env.TELEGRAM_WEBHOOK_SECRET = ' secret-value ';

    expect(telegramDeepLink()).toBe('https://t.me/phoenix9sig_bot?start=phoenix9sig');
    expect(telegramWebhookSecret()).toBe('secret-value');
  });
});
