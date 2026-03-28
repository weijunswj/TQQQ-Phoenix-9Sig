import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/telegram/disconnect/route';
import * as store from '@/lib/db/store';

const createAuthedRequest = () =>
  new Request('http://localhost/api/telegram/disconnect', {
    method: 'POST',
    headers: { 'x-auth-user-id': 'user-1' },
  });

vi.mock('@/lib/db/store', () => ({
  disconnectLatestActiveSubscriber: vi.fn(),
}));

describe('telegram disconnect route', () => {
  it('disconnects the latest connected subscriber', async () => {
    vi.mocked(store.disconnectLatestActiveSubscriber).mockResolvedValue({
      chatId: '42',
      active: false,
      subscribedAt: '2026-03-28T00:00:00.000Z',
      unsubscribedAt: '2026-03-28T00:05:00.000Z',
    });

    const response = await POST(createAuthedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chatId).toBe('42');
  });

  it('returns 400 when there is nothing to disconnect', async () => {
    vi.mocked(store.disconnectLatestActiveSubscriber).mockResolvedValue(null);

    const response = await POST(createAuthedRequest());

    expect(response.status).toBe(400);
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const response = await POST(new Request('http://localhost/api/telegram/disconnect', { method: 'POST' }));

    expect(response.status).toBe(401);
  });
});
