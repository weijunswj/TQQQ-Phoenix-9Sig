import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { COOKIE_NAME } from '@shared/const';
import { getSessionCookieOptions } from './_core/cookies';
import { systemRouter } from './_core/systemRouter';
import { publicProcedure, protectedProcedure, router } from './_core/trpc';
import { getStrategyPayloads } from './strategy/service.js';
import {
  listActiveSubscribers,
  subscribeChat,
  unsubscribeChat,
  getActiveSubscriberForUser,
  disconnectSubscriberForUser,
  hasSentAlertKey,
  markAlertKeySent,
  createConnectToken,
} from './telegram/store.js';
import {
  telegramBotConfigured,
  telegramConnectUrl,
  sendTelegramMessage,
} from './telegram/client.js';

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Strategy ──────────────────────────────────────────────────────────────
  strategy: router({
    current: publicProcedure.query(async () => {
      const { current, staleMarketData, nextRetryAtMs } = await getStrategyPayloads();
      return { current, staleMarketData, nextRetryAtMs };
    }),

    backtest: publicProcedure.query(async () => {
      const { backtest, staleMarketData, nextRetryAtMs } = await getStrategyPayloads();
      return { backtest, staleMarketData, nextRetryAtMs };
    }),
  }),

  // ── Telegram ──────────────────────────────────────────────────────────────
  telegram: router({
    /** Returns bot config status and connect URL for the current user. */
    status: publicProcedure.query(async ({ ctx }) => {
      const botConfigured = telegramBotConfigured();
      let connectUrl: string | null = null;
      if (botConfigured) {
        const baseUrl = await telegramConnectUrl();
        if (baseUrl) {
          if (ctx.user) {
            // Generate a one-time token so the webhook can link chatId → openId
            const token = await createConnectToken(ctx.user.openId);
            // Telegram deep-link: /start payload can only be alphanumeric + _ + -
            // We use a safe base36 token so this is fine
            connectUrl = `https://t.me/${baseUrl.split('t.me/')[1]?.split('?')[0]}?start=${token}`;
          } else {
            connectUrl = baseUrl;
          }
        }
      }
      const subscriber = ctx.user
        ? await getActiveSubscriberForUser(ctx.user.openId)
        : null;
      return {
        botConfigured,
        connectUrl,
        connected: Boolean(subscriber),
        chatId: subscriber?.chatId ?? null,
      };
    }),

    /** Check connection status from DB — webhook mode means /start writes to DB directly. */
    sync: protectedProcedure.mutation(async ({ ctx }) => {
      if (!telegramBotConfigured()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Telegram bot not configured.' });
      }
      // In webhook mode, /start commands are handled by the webhook endpoint which writes
      // directly to the DB. So "Check Connection" just queries the DB for this user's active sub.
      const subscriber = await getActiveSubscriberForUser(ctx.user.openId);
      return {
        connected: Boolean(subscriber),
        chatId: subscriber?.chatId ?? null,
        processed: 0,
      };
    }),

    /** Send a test message to the user's connected Telegram chat. */
    test: protectedProcedure.mutation(async ({ ctx }) => {
      const subscriber = await getActiveSubscriberForUser(ctx.user.openId);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No connected Telegram account found.' });
      }
      await sendTelegramMessage(
        subscriber.chatId,
        `✅ PhoenixSig test message — your Telegram alerts are working! (${new Date().toISOString()})`,
      );
      return { ok: true };
    }),

    /** Disconnect the current user's Telegram subscription. */
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const subscriber = await disconnectSubscriberForUser(ctx.user.openId);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No connected Telegram account found to disconnect.' });
      }
      return { ok: true, chatId: subscriber.chatId };
    }),
  }),

  // ── Jobs ──────────────────────────────────────────────────────────────────
  jobs: router({
    /**
     * Quarterly rebalance alert job.
     * Protected by JOB_RUNNER_SECRET header — called by the cron scheduler.
     */
    rebalanceAlerts: publicProcedure
      .input(z.object({ jobKey: z.string() }))
      .mutation(async ({ input }) => {
        const secret = process.env.JOB_RUNNER_SECRET;
        if (!secret || input.jobKey !== secret) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid job key.' });
        }

        const { backtest, current } = await getStrategyPayloads();
        const event = backtest.rebalanceLog[backtest.rebalanceLog.length - 1];

        if (!event) return { ok: true, skipped: 'No rebalance event.' };
        if (event.date !== current.asOfDate) {
          return { ok: true, skipped: 'Latest rebalance event is not due for today.' };
        }

        const alertKey = `${event.date}-${event.action}-${event.tqqqTradeDollars}`;
        if (await hasSentAlertKey(alertKey)) {
          return { ok: true, skipped: 'Already sent.' };
        }

        const subscribers = await listActiveSubscribers();
        if (subscribers.length === 0) {
          return { ok: true, skipped: 'No active subscribers.' };
        }

        const actionEmoji: Record<string, string> = {
          buy_tqqq: '🟢',
          sell_tqqq: '🔴',
          hold: '⚪',
        };
        const emoji = actionEmoji[event.action] ?? '📊';
        const message = [
          `${emoji} PhoenixSig Quarterly Rebalance`,
          `📅 Date: ${event.date}`,
          `⚡ Action: ${event.action.replace('_', ' ').toUpperCase()}`,
          `💵 TQQQ trade: $${event.tqqqTradeDollars.toFixed(2)}`,
          `🛡️ Defensive trade: $${event.defensiveTradeDollars.toFixed(2)}`,
          `📊 TQQQ value: $${event.tqqqValue.toFixed(2)} (${event.tqqqWeight.toFixed(1)}%)`,
          `💰 Defensive value: $${event.defensiveValue.toFixed(2)} (${event.defensiveWeight.toFixed(1)}%)`,
          `📝 ${event.reason}`,
        ].join('\n');

        const sendResults = await Promise.allSettled(
          subscribers.map((s) => sendTelegramMessage(s.chatId, message)),
        );
        const failed = sendResults
          .map((r, idx) => (r.status === 'rejected' ? subscribers[idx].chatId : null))
          .filter((id): id is string => id !== null);

        if (failed.length === subscribers.length) {
          throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: `Failed to send to all ${subscribers.length} subscribers.`,
          });
        }

        await markAlertKeySent(alertKey);
        return {
          ok: true,
          sent: subscribers.length - failed.length,
          failed,
          alertKey,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
