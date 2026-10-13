// Pure date helpers for the calendar grid. Dates are plain 'YYYY-MM-DD' strings and
// all arithmetic is done in UTC, so the browser's own time zone never matters.

export interface GridDay {
  date: string;
  day: number;
  inMonth: boolean;
}

export interface GridWeek {
  weekNumber: number;
  weekYear: number;
  days: GridDay[];
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseIsoDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** ISO 8601 week number and week-year (weeks start on Monday; week 1 holds Jan 4). */
export function isoWeek(date: string): { weekNumber: number; weekYear: number } {
  const d = parseIsoDate(date);
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(d.getTime() + (3 - weekday) * DAY_MS);
  const weekYear = thursday.getUTCFullYear();
  const jan4 = Date.UTC(weekYear, 0, 4);
  const jan4Weekday = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4Weekday * DAY_MS;
  return {
    weekNumber: Math.floor((thursday.getTime() - week1Monday) / (7 * DAY_MS)) + 1,
    weekYear,
  };
}

/** Monday-first weeks covering the whole month (4–6 rows). `month` is 'YYYY-MM'. */
export function monthGrid(month: string): GridWeek[] {
  const first = parseIsoDate(`${month}-01`);
  const monthIndex = first.getUTCMonth();
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY_MS);
  const weeks: GridWeek[] = [];
  for (let cursor = start; ;) {
    const days: GridDay[] = [];
    for (let i = 0; i < 7; i++) {
      days.push({
        date: toIsoDate(cursor),
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === monthIndex,
      });
      cursor = new Date(cursor.getTime() + DAY_MS);
    }
    weeks.push({ ...isoWeek(days[0]!.date), days });
    if (cursor.getUTCMonth() !== monthIndex) break;
  }
  return weeks;
}

/** 'YYYY-MM' shifted by `delta` months. */
export function addMonths(month: string, delta: number): string {
  const d = parseIsoDate(`${month}-01`);
  const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
  return toIsoDate(shifted).slice(0, 7);
}

/** 0 (nothing) … 4 (the biggest spending day of the month). */
export function heatLevel(spent: number, maxSpent: number): number {
  if (spent >= 0 || maxSpent >= 0) return 0;
  return Math.max(1, Math.ceil((spent / maxSpent) * 4));
}
