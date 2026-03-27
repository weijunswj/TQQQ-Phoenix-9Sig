import { readJsonCache, writeJsonCache } from '@/lib/data/cache';

export type TelegramSubscriber = {
  chatId: string;
  active: boolean;
  subscribedAt: string;
  unsubscribedAt: string | null;
};

type DbShape = {
  subscribers: TelegramSubscriber[];
  sentAlertKeys: string[];
};

const DB_PATH = '.data/db.json';

const load = async (): Promise<DbShape> => {
  const db = await readJsonCache<DbShape>(DB_PATH);
  return db ?? { subscribers: [], sentAlertKeys: [] };
};

const save = async (db: DbShape): Promise<void> => {
  await writeJsonCache(DB_PATH, db);
};

export const subscribeChat = async (chatId: string): Promise<TelegramSubscriber> => {
  const db = await load();
  const existing = db.subscribers.find((s) => s.chatId === chatId);
  if (existing) {
    existing.active = true;
    existing.unsubscribedAt = null;
    await save(db);
    return existing;
  }

  const sub: TelegramSubscriber = {
    chatId,
    active: true,
    subscribedAt: new Date().toISOString(),
    unsubscribedAt: null,
  };
  db.subscribers.push(sub);
  await save(db);
  return sub;
};

export const unsubscribeChat = async (chatId: string): Promise<TelegramSubscriber | null> => {
  const db = await load();
  const existing = db.subscribers.find((s) => s.chatId === chatId);
  if (!existing) return null;
  existing.active = false;
  existing.unsubscribedAt = new Date().toISOString();
  await save(db);
  return existing;
};

export const listActiveSubscribers = async (): Promise<TelegramSubscriber[]> => {
  const db = await load();
  return db.subscribers.filter((s) => s.active);
};

export const hasSentAlertKey = async (key: string): Promise<boolean> => {
  const db = await load();
  return db.sentAlertKeys.includes(key);
};

export const markAlertKeySent = async (key: string): Promise<void> => {
  const db = await load();
  if (!db.sentAlertKeys.includes(key)) {
    db.sentAlertKeys.push(key);
    await save(db);
  }
};
