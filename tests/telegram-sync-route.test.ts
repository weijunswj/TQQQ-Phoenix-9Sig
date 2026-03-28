import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/telegram/sync/route';
import * as store from '@/lib/db/store';
import * as telegramClient from '@/lib/telegram/client';

vi.mock('@/lib/db/store', () => ({
  getLatestActiveSubscriber: vi.fn(),
  getTelegramUpdateCursor: vi.fn(() => 0),
  setTelegramUpdateCursor: vi.fn(),
  subscribeChat: vi.fn(),
  unsubscribeChat: vi.fn(),
}));

vi.mock('@/lib/telegram/client', () => ({
  fetchTelegramUpdates: vi.fn(),
  telegramBotConfigured: vi.fn(() => true),
}));

describe('telegram sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(telegramClient.telegramBotConfigured).mockReturnValue(true);
    vi.mocked(store.getTelegramUpdateCursor).mockResolvedValue(0);
  });

  it('connects the latest /start chat from Telegram updates', async () => {
    vi.mocked(store.getTelegramUpdateCursor).mockResolvedValue(10);
    vi.mocked(telegramClient.fetchTelegramUpdates).mockResolvedValue([
      { update_id: 11, message: { text: '/start', chat: { id: 42 } } },
    ]);
    vi.mocked(store.subscribeChat).mockResolvedValue({
      chatId: '42',
      active: true,
      subscribedAt: '2026-03-29T00:00:00.000Z',
      unsubscribedAt: null,
    });
    vi.mocked(store.getLatestActiveSubscriber).mockResolvedValue({
      chatId: '42',
      active: true,
      subscribedAt: '2026-03-29T00:00:00.000Z',
      unsubscribedAt: null,
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(telegramClient.fetchTelegramUpdates).toHaveBeenCalledWith(11);
    expect(store.setTelegramUpdateCursor).toHaveBeenCalledWith(11);
    expect(store.subscribeChat).toHaveBeenCalledWith('42');
  });

  it('returns a friendly message when no /start update is found', async () => {
    vi.mocked(store.getTelegramUpdateCursor).mockResolvedValue(25);
    vi.mocked(telegramClient.fetchTelegramUpdates).mockResolvedValue([]);
    vi.mocked(store.getLatestActiveSubscriber).mockResolvedValue(null);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connected).toBe(false);
    expect(telegramClient.fetchTelegramUpdates).toHaveBeenCalledWith(26);
    expect(store.setTelegramUpdateCursor).not.toHaveBeenCalled();
    expect(body.message).toMatch(/No new Telegram connection update/i);
  });

  it('returns 400 when the bot token is missing', async () => {
    vi.mocked(telegramClient.telegramBotConfigured).mockReturnValue(false);

    const response = await POST();

    expect(response.status).toBe(400);
  });
});
