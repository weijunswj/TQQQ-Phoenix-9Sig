# PhoenixSig Single-Page Site

A production-oriented Next.js + TypeScript app for the shares-only PhoenixSig model. It includes a public single-page interface, backtest APIs, Telegram subscription handling, and an idempotent scheduled alert job.

## Features

- Single-page UI for strategy overview, current status, Telegram CTA, backtest metrics, rebalance log, and disclaimers.
- Shares-only strategy engine using TQQQ + defensive sleeve ( cash before SGOV inception, SGOV after inception ).
- Quarterly rebalance on first US business day of Jan/Apr/Jul/Oct using same-day open prices.
- Next-quarter TQQQ target resets to 115% of the post-rebalance TQQQ sleeve value.
- ATH drawdown sell-skip guard:
  - Triggered when daily close is below 70% of the rolling 315-trading-day ATH.
  - Sell suppression window runs for 126 trading days and refreshes daily while trigger persists.
- Floor rule:
  - On rebalance day, if TQQQ sleeve < 60% of portfolio, reset target to 60/40.
  - If a sell would be needed but ATH sell-skip is active, no sell is executed ( guard has priority ).
- Server-side daily caching for Yahoo market data and strategy payloads.
- Telegram webhook for `/start` subscribe and `/stop` unsubscribe.
- Protected scheduled job endpoint with idempotent alert-key checks.

## Full Strategy Rules

### 1. Initial Allocation ( only initially, this is not maintained )

| Rule | Detail |
| --- | --- |
| Start | 90% TQQQ / 10% Defensive |
| Defensive sleeve | Cash until SGOV data exists, then SGOV |

### 2. Quarterly rebalance ( Jan / Apr / Jul / Oct )

| Rule | Detail |
| --- | --- |
| Target | 15% target = Last quarter TQQQ balance x 1.15 ( updated quarterly ) |
| If Above | Sell excess down to 15% target -> Move excess to Defensive sleeve |
| If Below | Draw funds from Defensive sleeve to 15% target |
| Buy cap | If Defensive sleeve does not have enough, buy as much as possible -> Can end at 100% TQQQ |
| ATH DD | If TQQQ closing price < 70% of the highest closing price over the last 315 trading days (~5 quarters) -> Skip TQQQ SELLS for 126 trading days (~2 quarters) |
| ATH DD refresh | The 126-day skip window refreshes daily if condition persists |
| FLOOR | If TQQQ < 60% portfolio, reset to 60/40 TQQQ / Defensive allocation ( enforced only at quarterly rebalance ) |
| Final Step | The 15% next-quarter target is calculated last, after all rebalance adjustments are made |

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
TELEGRAM_WEBHOOK_SECRET=replace-with-random-secret
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
- Set Telegram webhook `secret_token` to match `TELEGRAM_WEBHOOK_SECRET` for request authentication.
- Schedule Manus cron ( shortly after US market open ) to call `POST /api/jobs/rebalance-alerts/run` with `x-job-key`.
- Keep persistent volume for `.data/` and `.cache/` if you want durable local-state behaviour.

## ELI5: Scheduled Endpoint Protection

Think of `x-job-key` like a private club password:
- Manus scheduler knows the password and includes it in every run.
- If someone else tries to call the endpoint without the same password, the app refuses.
- This prevents random internet callers from triggering your Telegram alerts.
