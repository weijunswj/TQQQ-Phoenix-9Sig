# PhoenixSig Site

PhoenixSig is a Next.js + TypeScript app for the shares-only PhoenixSig model. It provides:
- a public strategy dashboard
- Telegram alert connection controls
- backtest APIs
- a quarterly rebalance alert job

The strategy rulebook lives in [STRATEGY.md](./STRATEGY.md).

## Quick Start

### Install

```bash
npm install
copy .env.example .env.local
```

### Configure `.env.local`

```bash
TELEGRAM_BOT_TOKEN=123456:abc
JOB_RUNNER_SECRET=replace-with-strong-secret
AUTH_LOGIN_URL=https://manus.im
AUTH_BYPASS_LOCAL=false
AUTH_BYPASS_LOCAL_USER_ID=local-dev
AUTH_BYPASS_LOCAL_USER_NAME=Local Developer
AUTH_BYPASS_LOCAL_USER_EMAIL=
AUTH_USER_ID_HEADER=x-auth-user-id
AUTH_USER_NAME_HEADER=x-auth-user-name
AUTH_USER_EMAIL_HEADER=x-auth-user-email
AUTH_SESSION_COOKIE=auth_user_id
```

Important values:
- `TELEGRAM_BOT_TOKEN`: your BotFather token
- `JOB_RUNNER_SECRET`: protects the quarterly alert endpoint
- `AUTH_LOGIN_URL`: where the sign-in button sends users
- `AUTH_BYPASS_LOCAL=true`: optional localhost-only auth shortcut
- `AUTH_USER_*` / `AUTH_SESSION_COOKIE`: identity names supplied by your auth provider or host

### Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## How The App Behaves

- The dashboard is public
- Only Telegram actions are gated by sign-in
- With `AUTH_BYPASS_LOCAL=true`, localhost can use Telegram actions without real auth
- The sign-in page lives at [app/login-required/page.tsx](./app/login-required/page.tsx)

## Telegram Setup

1. Create your bot with BotFather.
2. Put the token into `TELEGRAM_BOT_TOKEN`.
3. Start the app.
4. Sign in if auth is enabled.
5. Click `Connect Telegram`.
6. Open the bot and send `/start`.
7. On localhost, click `Check Connection`.
8. Use `Send Test Message` once connected.

Notes:
- `/start` connects the current Telegram chat
- `/stop` disconnects the current Telegram chat
- Production webhook target: `POST /api/telegram/webhook`

## Quarterly Alert Trigger

PhoenixSig is designed for one server-side trigger that fans out alerts to all connected users.

Endpoint:

```text
POST /api/jobs/rebalance-alerts/run
Header: x-job-key: YOUR_JOB_RUNNER_SECRET
```

Recommended timing:
- first US business day of `Jan / Apr / Jul / Oct`
- shortly after US market open
- good default: `9:40 AM America/New_York`

Example Manus instruction:

```text
Send one HTTP POST request to https://YOUR-DOMAIN/api/jobs/rebalance-alerts/run with header x-job-key set to the saved job runner secret. PhoenixSig will decide whether a rebalance alert is due and, if due, send it to all connected users.
```

## Deploy

- Deploy as one full-stack Next.js service
- Configure the same env vars in your host secrets
- Point Telegram webhook delivery to `POST /api/telegram/webhook`
- Schedule the quarterly alert trigger against `POST /api/jobs/rebalance-alerts/run`
- Keep persistent storage for `.data/` and `.cache/` if you want durable local state

## Main API Surface

- `GET /api/strategy/current`
- `GET /api/strategy/backtest`
- `POST /api/telegram/webhook`
- `POST /api/telegram/sync` requires auth
- `POST /api/telegram/test` requires auth
- `POST /api/telegram/disconnect` requires auth
- `POST /api/jobs/rebalance-alerts/run`

## Verify

```bash
npm run lint
npm run test
npm run build
```

## Strategy Reference

The exact PhoenixSig rulebook, assumptions, and precedence order live in [STRATEGY.md](./STRATEGY.md).
