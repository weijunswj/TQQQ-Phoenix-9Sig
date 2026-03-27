'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useEffect, useState } from 'react';

const formatMs = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const msUntilNextUtcDay = (nowMs: number = Date.now()): number => {
  const now = new Date(nowMs);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return next - nowMs;
};

const utcDayKey = (nowMs: number = Date.now()): string => {
  const now = new Date(nowMs);
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

type Props = {
  initialNowMs: number;
};

export function DailyRefreshCountdown({ initialNowMs }: Props) {
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState(() => msUntilNextUtcDay(initialNowMs));
  const dayKeyRef = useRef(utcDayKey(initialNowMs));

  useEffect(() => {
    setRemainingMs(msUntilNextUtcDay());
    dayKeyRef.current = utcDayKey();

    const timer = setInterval(() => {
      setRemainingMs(msUntilNextUtcDay());
      const nextDayKey = utcDayKey();
      if (nextDayKey !== dayKeyRef.current) {
        dayKeyRef.current = nextDayKey;
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <p
      className="small"
      title="Dataset auto-refreshes once per UTC day and also refreshes immediately when you reload the page."
      style={{ marginTop: '.6rem' }}
    >
      Next dataset auto-refresh (UTC): <strong>{formatMs(remainingMs)}</strong>
    </p>
  );
}
