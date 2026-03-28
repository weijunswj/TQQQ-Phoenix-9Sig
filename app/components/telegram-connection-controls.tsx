'use client';

import { useEffect, useState } from 'react';

type Props = {
  botConfigured: boolean;
  connectUrl: string | null;
  initiallyConnected: boolean;
  isAuthenticated: boolean;
  signInUrl: string;
};

type SubmitState =
  | { tone: 'idle'; message: string }
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string };

const readErrorMessage = async (res: Response, fallback: string): Promise<string> => {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === 'string' ? body.error : fallback;
};

export function TelegramConnectionControls({ botConfigured, connectUrl, initiallyConnected, isAuthenticated, signInUrl }: Props) {
  const [isConnected, setIsConnected] = useState(initiallyConnected);
  const [pendingAction, setPendingAction] = useState<'sync' | 'test' | 'disconnect' | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ tone: 'idle', message: '' });

  useEffect(() => {
    if (!submitState.message) return undefined;

    const timer = window.setTimeout(() => {
      setSubmitState({ tone: 'idle', message: '' });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [submitState]);

  const syncConnection = async () => {
    setPendingAction('sync');
    setSubmitState({ tone: 'idle', message: '' });

    try {
      const res = await fetch('/api/telegram/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage = typeof body?.error === 'string' ? body.error : 'Telegram sync failed.';
        throw new Error(errorMessage);
      }

      if (body?.connected) {
        setIsConnected(true);
        setSubmitState({ tone: 'idle', message: '' });
      } else {
        const infoMessage = typeof body?.message === 'string' ? body.message : 'Telegram has not sent a usable /start update yet.';
        setSubmitState({ tone: 'error', message: infoMessage });
      }
    } catch (error) {
      setSubmitState({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Telegram sync failed.',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const sendTestMessage = async () => {
    setPendingAction('test');
    setSubmitState({ tone: 'idle', message: '' });

    try {
      const res = await fetch('/api/telegram/test', { method: 'POST' });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Telegram test failed.'));
      }

      setSubmitState({ tone: 'success', message: 'Test message sent to the connected Telegram account.' });
    } catch (error) {
      setSubmitState({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Telegram test failed.',
      });
    } finally {
      setPendingAction(null);
    }
  };

  const disconnectBot = async () => {
    setPendingAction('disconnect');
    setSubmitState({ tone: 'idle', message: '' });

    try {
      const res = await fetch('/api/telegram/disconnect', { method: 'POST' });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Telegram disconnect failed.'));
      }

      setIsConnected(false);
      setSubmitState({ tone: 'idle', message: '' });
    } catch (error) {
      setSubmitState({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Telegram disconnect failed.',
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className={`telegram-controls${isConnected ? ' telegram-controls-connected' : ''}`}>
      {!isAuthenticated ? (
        <>
          <div className="telegram-disconnected-grid">
            <span className="status-chip warn telegram-disconnected-status">Sign In</span>
            <a className="cta telegram-action-button" href={signInUrl}>Sign In To Connect Telegram</a>
          </div>
          <p className="small">
            Telegram connection, test sends, and disconnect actions are available after sign-in.
          </p>
          {!botConfigured ? (
            <p className="small status-text-warn">
              Missing <code>TELEGRAM_BOT_TOKEN</code>, so the connect flow will stay unavailable until the bot token is configured.
            </p>
          ) : null}
        </>
      ) : isConnected ? (
        <>
          <div className="telegram-connected-grid">
            <span className="status-chip good telegram-connected-status">Connected</span>
            <button
              type="button"
              className="cta cta-button telegram-action-button"
              onClick={sendTestMessage}
              disabled={!botConfigured || pendingAction !== null}
            >
              {pendingAction === 'test' ? 'Sending...' : 'Send Test Message'}
            </button>
            <button
              type="button"
              className="subtle-button telegram-action-button telegram-danger-button"
              onClick={disconnectBot}
              disabled={pendingAction !== null}
            >
              {pendingAction === 'disconnect' ? 'Disconnecting...' : 'Disconnect Bot'}
            </button>
          </div>
          {!botConfigured ? (
            <p className="small status-text-warn">
              Missing <code>TELEGRAM_BOT_TOKEN</code>, so test sends are disabled until the bot token is configured.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="telegram-disconnected-grid">
            <span className="status-chip bad telegram-disconnected-status">Disconnected</span>
            {connectUrl ? (
              <a className="cta telegram-action-button" href={connectUrl} target="_blank" rel="noreferrer">Connect Telegram</a>
            ) : (
              <button type="button" className="cta cta-button telegram-action-button" disabled>Connect Telegram</button>
            )}
            {botConfigured ? (
              <button
                type="button"
                className="subtle-button telegram-action-button"
                onClick={syncConnection}
                disabled={pendingAction !== null}
              >
                {pendingAction === 'sync' ? 'Checking...' : 'Check Connection'}
              </button>
            ) : null}
          </div>
          {!botConfigured ? (
            <p className="small status-text-warn">
              Missing <code>TELEGRAM_BOT_TOKEN</code>, so the connect link is disabled until the bot token is configured.
            </p>
          ) : null}
        </>
      )}

      {submitState.message ? (
        <p
          className={`telegram-toast ${submitState.tone === 'error' ? 'telegram-toast-error' : 'telegram-toast-success'}`}
          role="status"
          aria-live={submitState.tone === 'error' ? 'assertive' : 'polite'}
        >
          {submitState.message}
        </p>
      ) : null}
    </div>
  );
}
