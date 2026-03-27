import { NextResponse } from 'next/server';
import { subscribeChat, unsubscribeChat } from '@/lib/db/store';

export async function POST(req: Request) {
  const body = await req.json();
  const text: string | undefined = body?.message?.text;
  const chatId: string | undefined = body?.message?.chat?.id ? String(body.message.chat.id) : undefined;

  if (!text || !chatId) return NextResponse.json({ ok: true, ignored: true });

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
