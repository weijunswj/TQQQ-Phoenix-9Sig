const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const REFRESH_HOUR = 8;

const singaporeLocalDate = (nowMs: number): Date => new Date(nowMs + SINGAPORE_OFFSET_MS);

const isWeekday = (day: number): boolean => day >= 1 && day <= 5;

const singaporeDateKey = (date: Date): string => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const localRefreshBoundaryMs = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), REFRESH_HOUR, 0, 0, 0);

const shiftSingaporeWeekday = (fromDate: Date, step: 1 | -1): Date => {
  let offset = step;

  while (true) {
    const candidate = new Date(
      Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate() + offset, 12, 0, 0, 0),
    );

    if (isWeekday(candidate.getUTCDay())) {
      return candidate;
    }

    offset += step;
  }
};

export const currentSingaporeRefreshKey = (nowMs: number = Date.now()): string => {
  const localNow = singaporeLocalDate(nowMs);
  const localNowMs = nowMs + SINGAPORE_OFFSET_MS;
  const todayBoundaryMs = localRefreshBoundaryMs(localNow);
  const refreshDate =
    isWeekday(localNow.getUTCDay()) && localNowMs >= todayBoundaryMs
      ? localNow
      : shiftSingaporeWeekday(localNow, -1);

  return `${singaporeDateKey(refreshDate)}-sgt-0800`;
};

export const nextSingaporeRefreshTimeMs = (nowMs: number = Date.now()): number => {
  const localNow = singaporeLocalDate(nowMs);
  const localNowMs = nowMs + SINGAPORE_OFFSET_MS;
  const todayBoundaryMs = localRefreshBoundaryMs(localNow);

  if (isWeekday(localNow.getUTCDay()) && localNowMs < todayBoundaryMs) {
    return todayBoundaryMs - SINGAPORE_OFFSET_MS;
  }

  const nextRefreshDate = shiftSingaporeWeekday(localNow, 1);
  return localRefreshBoundaryMs(nextRefreshDate) - SINGAPORE_OFFSET_MS;
};

export const msUntilNextSingaporeRefresh = (nowMs: number = Date.now()): number =>
  Math.max(0, nextSingaporeRefreshTimeMs(nowMs) - nowMs);
