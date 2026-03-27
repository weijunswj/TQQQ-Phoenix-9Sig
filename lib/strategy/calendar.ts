import Holidays from 'date-holidays';
import { addDays, format } from 'date-fns';

const hd = new Holidays('US');

const isUsBusinessDay = (date: Date): boolean => {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;

  const holiday = hd.isHoliday(date);
  return !holiday;
};

export const nextBusinessDay = (date: Date): Date => {
  let cursor = addDays(date, 1);
  while (!isUsBusinessDay(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
};

export const firstBusinessDayOfQuarter = (year: number, quarter: 1 | 2 | 3 | 4): Date => {
  const monthMap = { 1: 0, 2: 3, 3: 6, 4: 9 };
  let date = new Date(Date.UTC(year, monthMap[quarter], 1));
  while (!isUsBusinessDay(date)) {
    date = addDays(date, 1);
  }
  return date;
};

export const quarterRebalanceDates = (startYear: number, endYear: number): Set<string> => {
  const dates = new Set<string>();
  for (let year = startYear; year <= endYear; year += 1) {
    for (const q of [1, 2, 3, 4] as const) {
      dates.add(format(firstBusinessDayOfQuarter(year, q), 'yyyy-MM-dd'));
    }
  }
  return dates;
};
