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

const msUntilNextUtcDay = (): number => {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return next - now.getTime();
};

const utcDayKey = (): string => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function DailyRefreshCountdown() {
  const router = useRouter();
  const [remainingMs, setRemainingMs] = useState(msUntilNextUtcDay());
  const dayKeyRef = useRef(utcDayKey());

  useEffect(() => {
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
