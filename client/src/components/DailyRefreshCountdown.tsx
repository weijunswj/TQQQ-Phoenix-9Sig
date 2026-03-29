import { useRef } from 'react';
import { useEffect, useState } from 'react';
import { currentSingaporeRefreshKey, msUntilNextSingaporeRefresh } from '../../../server/time/singapore-refresh';

const formatMs = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

type Props = {
  initialNowMs: number;
  staleMarketData: boolean;
  nextRetryAtMs: number | null;
  onRefreshNeeded?: () => void;
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

export function DailyRefreshCountdown({ initialNowMs, staleMarketData, nextRetryAtMs, onRefreshNeeded }: Props) {
  const [remainingMs, setRemainingMs] = useState(() => msUntilNextSingaporeRefresh(initialNowMs));
  const refreshKeyRef = useRef(currentSingaporeRefreshKey(initialNowMs));
  const lastRetryTriggerRef = useRef<number | null>(null);

  useEffect(() => {
    lastRetryTriggerRef.current = null;
  }, [nextRetryAtMs]);

  useEffect(() => {
    setRemainingMs(msUntilNextSingaporeRefresh());
    refreshKeyRef.current = currentSingaporeRefreshKey();

    const timer = setInterval(() => {
      setRemainingMs(msUntilNextSingaporeRefresh());
      const nextRefreshKey = currentSingaporeRefreshKey();
      if (nextRefreshKey !== refreshKeyRef.current) {
        refreshKeyRef.current = nextRefreshKey;
        // Trigger a data refetch via callback (tRPC invalidation) instead of full page reload
        onRefreshNeeded?.();
      }

      if (
        staleMarketData
        && nextRetryAtMs
        && Date.now() >= nextRetryAtMs
        && lastRetryTriggerRef.current !== nextRetryAtMs
      ) {
        lastRetryTriggerRef.current = nextRetryAtMs;
        onRefreshNeeded?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [nextRetryAtMs, staleMarketData, onRefreshNeeded]);

  return (
    <p
      className="small"
      title="Dataset auto-refreshes at 8:00 AM Singapore time on weekdays and also refreshes immediately when you reload the page."
      style={{ marginTop: '.6rem' }}
    >
      Next Dataset Auto-Refresh (Singapore, 8:00 AM Weekdays): <strong>{formatMs(remainingMs)}</strong>
      {staleMarketData && nextRetryAtMs ? (
        <>
          <br />
          <span>
            Live market fetch failed. Using cached data and retrying in{' '}
            <strong>{formatTime(nextRetryAtMs - Date.now())}</strong>.
          </span>
        </>
      ) : null}
    </p>
  );
}
