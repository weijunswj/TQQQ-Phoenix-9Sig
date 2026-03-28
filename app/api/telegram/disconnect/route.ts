import { NextResponse } from 'next/server';
import { disconnectLatestActiveSubscriber } from '@/lib/db/store';

export async function POST() {
  const subscriber = await disconnectLatestActiveSubscriber();
  if (!subscriber) {
    return NextResponse.json(
      { ok: false, error: 'No connected Telegram account found to disconnect.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, chatId: subscriber.chatId });
}
