import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getDb } from '../db.js';
import { telegramSubscribers, alertSentKeys, appState } from '../../drizzle/schema.js';

export type TelegramSubscriber = {
  chatId: string;
  active: boolean;
  openId: string | null;
};

const CURSOR_KEY = 'telegram_cursor';

// ── Subscriber management ──────────────────────────────────────────────────

export const subscribeChat = async (chatId: string, openId?: string): Promise<TelegramSubscriber> => {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');

  await db
    .insert(telegramSubscribers)
    .values({ chatId, active: true, openId: openId ?? null })
    .onDuplicateKeyUpdate({ set: { active: true, openId: openId ?? null } });

  return { chatId, active: true, openId: openId ?? null };
};

export const unsubscribeChat = async (chatId: string): Promise<TelegramSubscriber | null> => {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(telegramSubscribers)
    .where(eq(telegramSubscribers.chatId, chatId))
    .limit(1);

  if (!rows[0]) return null;

  await db
    .update(telegramSubscribers)
    .set({ active: false })
    .where(eq(telegramSubscribers.chatId, chatId));

  return { chatId: rows[0].chatId, active: false, openId: rows[0].openId };
};

export const listActiveSubscribers = async (): Promise<TelegramSubscriber[]> => {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(telegramSubscribers)
    .where(eq(telegramSubscribers.active, true));

  return rows.map((r) => ({ chatId: r.chatId, active: r.active, openId: r.openId }));
};

/** Returns the most recently subscribed active subscriber for a given openId (or any if openId is null). */
export const getActiveSubscriberForUser = async (openId: string): Promise<TelegramSubscriber | null> => {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(telegramSubscribers)
    .where(and(eq(telegramSubscribers.active, true), eq(telegramSubscribers.openId, openId)))
    .limit(1);

  if (!rows[0]) return null;
  return { chatId: rows[0].chatId, active: rows[0].active, openId: rows[0].openId };
};

/** Returns the most recently subscribed active subscriber (any user). */
export const getLatestActiveSubscriber = async (): Promise<TelegramSubscriber | null> => {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(telegramSubscribers)
    .where(eq(telegramSubscribers.active, true))
    .limit(1);

  if (!rows[0]) return null;
  return { chatId: rows[0].chatId, active: rows[0].active, openId: rows[0].openId };
};

/** Disconnects the active subscriber for a given openId. */
export const disconnectSubscriberForUser = async (openId: string): Promise<TelegramSubscriber | null> => {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(telegramSubscribers)
    .where(and(eq(telegramSubscribers.active, true), eq(telegramSubscribers.openId, openId)))
    .limit(1);

  if (!rows[0]) return null;

  await db
    .update(telegramSubscribers)
    .set({ active: false })
    .where(eq(telegramSubscribers.chatId, rows[0].chatId));

  return { chatId: rows[0].chatId, active: false, openId: rows[0].openId };
};

// ── Update cursor ──────────────────────────────────────────────────────────

export const getTelegramUpdateCursor = async (): Promise<number> => {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select()
    .from(appState)
    .where(eq(appState.stateKey, CURSOR_KEY))
    .limit(1);

  return rows[0] ? Number(rows[0].stateValue) : 0;
};

export const setTelegramUpdateCursor = async (cursor: number): Promise<void> => {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(appState)
    .values({ stateKey: CURSOR_KEY, stateValue: String(cursor) })
    .onDuplicateKeyUpdate({ set: { stateValue: String(cursor) } });
};

// ── Deep-link token store ────────────────────────────────────────────────────
// Tokens are stored in app_state with key `tg_token:<token>` and value `<openId>:<expiresAt>`.
// TTL is 10 minutes.

const TOKEN_TTL_MS = 10 * 60 * 1000;

export const createConnectToken = async (openId: string): Promise<string> => {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  await db
    .insert(appState)
    .values({ stateKey: `tg_token:${token}`, stateValue: `${openId}:${expiresAt}` })
    .onDuplicateKeyUpdate({ set: { stateValue: `${openId}:${expiresAt}` } });
  return token;
};

export const resolveConnectToken = async (token: string): Promise<string | null> => {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(appState)
    .where(eq(appState.stateKey, `tg_token:${token}`))
    .limit(1);
  if (!rows[0]) return null;
  const [openId, expiresAtStr] = rows[0].stateValue.split(':');
  if (!openId || !expiresAtStr) return null;
  if (Date.now() > Number(expiresAtStr)) {
    // Expired — clean up
    await db.delete(appState).where(eq(appState.stateKey, `tg_token:${token}`));
    return null;
  }
  // Consume the token (one-time use)
  await db.delete(appState).where(eq(appState.stateKey, `tg_token:${token}`));
  return openId;
};

// ── Alert deduplication ────────────────────────────────────────────────────

export const hasSentAlertKey = async (key: string): Promise<boolean> => {
  const db = await getDb();
  if (!db) return false;

  const rows = await db
    .select()
    .from(alertSentKeys)
    .where(eq(alertSentKeys.alertKey, key))
    .limit(1);

  return rows.length > 0;
};

export const markAlertKeySent = async (key: string): Promise<void> => {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(alertSentKeys)
    .values({ alertKey: key })
    .onDuplicateKeyUpdate({ set: { alertKey: key } });
};
