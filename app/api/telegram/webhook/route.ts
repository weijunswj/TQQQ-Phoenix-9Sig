import { NextResponse } from 'next/server';
import { subscribeChat, unsubscribeChat } from '@/lib/db/store';
import { telegramWebhookSecret } from '@/lib/telegram/client';

export async function POST(req: Request) {
  const expectedSecret = telegramWebhookSecret();
  if (expectedSecret) {
    const token = req.headers.get('x-telegram-bot-api-secret-token');
    if (token !== expectedSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorised webhook token' }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: true, reason: 'invalid-json' });
  }

  const message = (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    body.message &&
    typeof body.message === 'object'
  ) ? body.message : undefined;
  const text = message && 'text' in message ? message.text : undefined;
  const chat = message && 'chat' in message ? message.chat : undefined;
  const chatId =
    chat && typeof chat === 'object' && 'id' in chat && (typeof chat.id === 'number' || typeof chat.id === 'string')
      ? String(chat.id)
      : undefined;

  if (typeof text !== 'string' || !chatId) return NextResponse.json({ ok: true, ignored: true });

  if (text.startsWith('/start')) {
    await subscribeChat(chatId);
    return NextResponse.json({ ok: true, status: 'subscribed' });
  }

  if (text.startsWith('/stop')) {
    await unsubscribeChat(chatId);
    return NextResponse.json({ ok: true, status: 'unsubscribed' });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
