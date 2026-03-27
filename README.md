# Phoenix 9Sig Single-Page Site

A production-oriented Next.js + TypeScript app for the shares-only Phoenix 9Sig model. It includes a public single-page interface, backtest APIs, Telegram subscription handling, and an idempotent scheduled alert job.

## Features

- Single-page UI for strategy overview, current status, Telegram CTA, backtest metrics, rebalance log, and disclaimers.
- Shares-only strategy engine using TQQQ + defensive sleeve ( cash before SGOV inception, SGOV after inception ).
- Quarterly rebalance on first US business day of Jan/Apr/Jul/Oct using same-day open prices.
- ATH drawdown sell-skip guard:
  - Triggered when daily close is below 70% of the rolling 315-trading-day ATH.
  - Sell suppression window runs for 126 trading days and refreshes daily while trigger persists.
- Floor rule:
  - On rebalance day, if TQQQ sleeve < 60% of portfolio, reset target to 60/40.
  - If a sell would be needed but ATH sell-skip is active, no sell is executed ( guard has priority ).
- Server-side daily caching for Yahoo market data and strategy payloads.
- Telegram webhook for `/start` subscribe and `/stop` unsubscribe.
- Protected scheduled job endpoint with idempotent alert-key checks.

## Architecture

- `app/page.tsx`: Single-page public interface.
- `app/api/strategy/current`: Current state API.
- `app/api/strategy/backtest`: Backtest API.
- `app/api/telegram/webhook`: Telegram command webhook.
- `app/api/jobs/rebalance-alerts/run`: Protected scheduled alert sender.
- `lib/strategy/*`: Types, market calendar, strategy engine, strategy service.
- `lib/data/*`: Yahoo adapter and JSON cache helpers.
- `lib/db/store.ts`: Small persistence layer for subscribers and alert send history.
- `lib/telegram/client.ts`: Telegram API and deep-link helpers.
- `tests/engine.test.ts`: Core strategy smoke tests.

## Environment Variables

Create `.env.local`:

```bash
TELEGRAM_BOT_TOKEN=123456:abc
TELEGRAM_BOT_USERNAME=phoenix9sig_bot
JOB_RUNNER_SECRET=replace-with-strong-secret
```

## API Contracts

### `GET /api/strategy/current`
Returns:
- Market timestamp and as-of date.
- Next rebalance date.
- Action copy.
- Portfolio values and target value.
- Rule flags (`athDdActive`, `skipSellWindowEnds`, `floorTriggered`, etc.).

### `GET /api/strategy/backtest`
Returns:
- Equity curve.
- Benchmark series ( buy-and-hold TQQQ + defensive baseline ).
- Summary metrics.
- Rebalance log rows.

### `POST /api/telegram/webhook`
- Handles Telegram updates.
- `/start` activates subscription for the chat.
- `/stop` deactivates subscription for the chat.
- Ignores unrelated or malformed updates.

### `POST /api/jobs/rebalance-alerts/run`
- Requires `x-job-key` header matching `JOB_RUNNER_SECRET`.
- Computes latest rebalance event and sends Telegram alert once per idempotency key.
- Stores sent keys to prevent duplicate sends.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Test & Lint

```bash
npm run lint
npm run test
```

## Deployment Notes ( Manus )

- Deploy as one full-stack Next.js service.
- Configure environment variables in Manus secrets.
- Register Telegram webhook URL to `POST /api/telegram/webhook`.
- Schedule Manus cron ( shortly after US market open ) to call `POST /api/jobs/rebalance-alerts/run` with `x-job-key`.
- Keep persistent volume for `.data/` and `.cache/` if you want durable local-state behaviour.

## ELI5: Scheduled Endpoint Protection

Think of `x-job-key` like a private club password:
- Manus scheduler knows the password and includes it in every run.
- If someone else tries to call the endpoint without the same password, the app refuses.
- This prevents random internet callers from triggering your Telegram alerts.

