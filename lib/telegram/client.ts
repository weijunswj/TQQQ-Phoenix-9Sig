const telegramBase = (): string => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  return `https://api.telegram.org/bot${token}`;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const sendTelegramMessage = async (chatId: string, text: string): Promise<void> => {
  const maxAttempts = 3;
  const timeoutMs = 10_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${telegramBase()}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: controller.signal,
      });

      if (res.ok) return;

      const body = await res.text().catch(() => '');
      const isRetryable = res.status === 429 || res.status >= 500;

      if (!isRetryable || attempt === maxAttempts) {
        throw new Error(`Telegram send failed (${res.status}): ${body}`);
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        if (error instanceof Error) throw error;
        throw new Error('Telegram send failed: unknown error');
      }
    } finally {
      clearTimeout(timeoutId);
    }

    await sleep(attempt * 500);
  }
};

export const telegramDeepLink = (): string => {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim() ?? 'your_bot';
  return `https://t.me/${botUsername}?start=phoenix9sig`;
};

export const telegramWebhookSecret = (): string | null => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return secret || null;
};
