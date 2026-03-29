import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { COOKIE_NAME } from '@shared/const';
import { getSessionCookieOptions } from './_core/cookies';
import { systemRouter } from './_core/systemRouter';
import { publicProcedure, protectedProcedure, router } from './_core/trpc';
import { getStrategyPayloads } from './strategy/service.js';
import { runRebalanceAlertsJob } from './jobs/rebalance-alerts.js';
import {
  subscribeChat,
  unsubscribeChat,
  getActiveSubscriberForUser,
  disconnectSubscriberForUser,
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

  telegram: router({
    status: publicProcedure.query(async ({ ctx }) => {
      const botConfigured = telegramBotConfigured();
      let connectUrl: string | null = null;

      if (botConfigured) {
        const baseUrl = await telegramConnectUrl();
        if (baseUrl) {
          if (ctx.user) {
            // Create a one-time token so the Telegram webhook can link chatId to openId.
            const token = await createConnectToken(ctx.user.openId);
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

    sync: protectedProcedure.mutation(async ({ ctx }) => {
      if (!telegramBotConfigured()) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Telegram bot not configured.' });
      }

      // In webhook mode, /start writes directly to the DB, so sync just rechecks the linked subscriber.
      const subscriber = await getActiveSubscriberForUser(ctx.user.openId);
      return {
        connected: Boolean(subscriber),
        chatId: subscriber?.chatId ?? null,
        processed: 0,
      };
    }),

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

    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const subscriber = await disconnectSubscriberForUser(ctx.user.openId);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No connected Telegram account found to disconnect.' });
      }

      return { ok: true, chatId: subscriber.chatId };
    }),

    subscribeChat: protectedProcedure
      .input(z.object({ chatId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const subscriber = await subscribeChat(input.chatId, ctx.user.openId);
        return { ok: true, subscriber };
      }),

    unsubscribeChat: protectedProcedure
      .input(z.object({ chatId: z.string() }))
      .mutation(async ({ input }) => {
        const subscriber = await unsubscribeChat(input.chatId);
        return { ok: true, subscriber };
      }),
  }),

  jobs: router({
    rebalanceAlerts: publicProcedure
      .input(z.object({ jobKey: z.string() }))
      .mutation(async ({ input }) => {
        const result = await runRebalanceAlertsJob(input.jobKey);

        if (result.status === 401) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: result.body.ok ? 'Invalid job key.' : result.body.error,
          });
        }

        if (result.status >= 500) {
          throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: result.body.ok ? 'Rebalance alert job failed.' : result.body.error,
          });
        }

        return result.body;
      }),
  }),
});

export type AppRouter = typeof appRouter;
