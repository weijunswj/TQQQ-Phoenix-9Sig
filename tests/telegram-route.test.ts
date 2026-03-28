import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/telegram/test/route';
import * as store from '@/lib/db/store';
import * as telegramClient from '@/lib/telegram/client';

const createAuthedRequest = () =>
  new Request('http://localhost/api/telegram/test', {
    method: 'POST',
    headers: { 'x-auth-user-id': 'user-1' },
  });

vi.mock('@/lib/db/store', () => ({
  getLatestActiveSubscriber: vi.fn(),
}));

vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: vi.fn(),
  telegramBotConfigured: vi.fn(() => true),
}));

describe('telegram test route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends to the latest connected subscriber', async () => {
    vi.mocked(store.getLatestActiveSubscriber).mockResolvedValue({
      chatId: '42',
      active: true,
      subscribedAt: '2026-03-28T00:00:00.000Z',
      unsubscribedAt: null,
    });
    vi.mocked(telegramClient.sendTelegramMessage).mockResolvedValue(undefined);

    const response = await POST(createAuthedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chatId).toBe('42');
    expect(telegramClient.sendTelegramMessage).toHaveBeenCalledWith('42', expect.stringMatching(/PhoenixSig Telegram health check OK/i));
  });

  it('returns 400 when no connected account exists', async () => {
    vi.mocked(store.getLatestActiveSubscriber).mockResolvedValue(null);

    const response = await POST(createAuthedRequest());

    expect(response.status).toBe(400);
  });

  it('returns 400 when the bot token is not configured', async () => {
    vi.mocked(store.getLatestActiveSubscriber).mockResolvedValue({
      chatId: '42',
      active: true,
      subscribedAt: '2026-03-28T00:00:00.000Z',
      unsubscribedAt: null,
    });
    vi.mocked(telegramClient.telegramBotConfigured).mockReturnValue(false);

    const response = await POST(createAuthedRequest());

    expect(response.status).toBe(400);
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const response = await POST(new Request('http://localhost/api/telegram/test', { method: 'POST' }));

    expect(response.status).toBe(401);
  });
});
