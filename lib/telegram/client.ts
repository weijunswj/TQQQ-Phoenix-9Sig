const telegramBase = (): string => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  return `https://api.telegram.org/bot${token}`;
};

export const sendTelegramMessage = async (chatId: string, text: string): Promise<void> => {
  await fetch(`${telegramBase()}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
};

export const telegramDeepLink = (): string => {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'your_bot';
  return `https://t.me/${botUsername}?start=phoenix9sig`;
};
