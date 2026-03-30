'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useEffect, useState } from 'react';
import { currentSingaporeRefreshKey, msUntilNextSingaporeRefresh } from '@/lib/time/singapore-refresh';

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
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

export function DailyRefreshCountdown({ initialNowMs, staleMarketData, nextRetryAtMs }: Props) {
  const router = useRouter();
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
        router.refresh();
      }

      if (
        staleMarketData
        && nextRetryAtMs
        && Date.now() >= nextRetryAtMs
        && lastRetryTriggerRef.current !== nextRetryAtMs
      ) {
        lastRetryTriggerRef.current = nextRetryAtMs;
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [nextRetryAtMs, router, staleMarketData]);

  return (
    <p
      className="small"
      title="Dataset auto-refreshes at 9:35 PM Singapore time on weekdays and also refreshes immediately when you reload the page."
      style={{ marginTop: '.6rem' }}
    >
      Next Dataset Auto-Refresh ( Singapore, 9:35 PM Weekdays ): <strong>{formatMs(remainingMs)}</strong>
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
