import { DateTime } from 'luxon';

/** Half-open UTC range [start, end) as ISO 8601 strings, comparable lexicographically. */
export interface UtcRange {
  start: string;
  end: string;
}

function local(now: Date, tz: string): DateTime {
  const dt = DateTime.fromJSDate(now, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid time zone: ${tz}`);
  return dt;
}

function toRange(start: DateTime, end: DateTime): UtcRange {
  return { start: toUtcIso(start), end: toUtcIso(end) };
}

/** Canonical storage format: UTC, millisecond precision, trailing "Z". */
export function toUtcIso(value: Date | DateTime): string {
  const dt = value instanceof Date ? DateTime.fromJSDate(value) : value;
  return dt.toUTC().toISO({ suppressMilliseconds: false, includeOffset: true })!;
}

/** The local calendar day containing `now`. */
export function dayRange(now: Date, tz: string): UtcRange {
  const start = local(now, tz).startOf('day');
  return toRange(start, start.plus({ days: 1 }));
}

/** The local week (Monday 00:00 to next Monday 00:00) containing `now`. */
export function weekRange(now: Date, tz: string): UtcRange {
  // Luxon's startOf('week') uses ISO weeks, which start on Monday.
  const start = local(now, tz).startOf('week');
  return toRange(start, start.plus({ weeks: 1 }));
}

/** The local week before the one containing `now`. */
export function previousWeekRange(now: Date, tz: string): UtcRange {
  const start = local(now, tz).startOf('week').minus({ weeks: 1 });
  return toRange(start, start.plus({ weeks: 1 }));
}

/** Local calendar date of `now`, formatted as YYYY-MM-DD. */
export function localDate(now: Date, tz: string): string {
  return local(now, tz).toISODate()!;
}

/** The local calendar month containing `now`. */
export function monthRange(now: Date, tz: string): UtcRange {
  const start = local(now, tz).startOf('month');
  return toRange(start, start.plus({ months: 1 }));
}

/** The local month before the one containing `now`. */
export function previousMonthRange(now: Date, tz: string): UtcRange {
  const start = local(now, tz).startOf('month').minus({ months: 1 });
  return toRange(start, start.plus({ months: 1 }));
}

export interface WeekRef {
  range: UtcRange;
  weekYear: number;
  weekNumber: number;
  isCurrent: boolean;
  /** false when the cross-year rule fell back to last year */
  isThisYear: boolean;
}

export type ResolveWeekResult =
  | ({ ok: true } & WeekRef)
  | { ok: false; reason: 'no_such_week'; weekYear: number; weekNumber: number };

/**
 * ISO week `week` of the current week-year, or the current week when omitted.
 * A week that has not started yet this year resolves to last year's week instead.
 */
export function resolveWeek(now: Date, tz: string, week?: number): ResolveWeekResult {
  const today = local(now, tz);
  const weekNumber = week ?? today.weekNumber;
  const weekYear = weekNumber > today.weekNumber ? today.weekYear - 1 : today.weekYear;
  const start = DateTime.fromObject({ weekYear, weekNumber, weekday: 1 }, { zone: tz });
  // Luxon rejects week 53 in 52-week years (and anything above 53).
  if (!start.isValid) return { ok: false, reason: 'no_such_week', weekYear, weekNumber };
  return {
    ok: true,
    range: toRange(start, start.plus({ weeks: 1 })),
    weekYear,
    weekNumber,
    isCurrent: weekYear === today.weekYear && weekNumber === today.weekNumber,
    isThisYear: weekYear === today.weekYear,
  };
}

export interface MonthRef {
  range: UtcRange;
  year: number;
  /** 1–12 */
  month: number;
  isCurrent: boolean;
  isThisYear: boolean;
}

/**
 * Month `month` (1–12) of the current year, or the current month when omitted.
 * A month that has not started yet this year resolves to last year's month instead.
 */
export function resolveMonth(now: Date, tz: string, month?: number): MonthRef {
  const today = local(now, tz);
  const m = month ?? today.month;
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError(`Invalid month: ${m}`);
  const year = m > today.month ? today.year - 1 : today.year;
  const start = DateTime.fromObject({ year, month: m, day: 1 }, { zone: tz });
  return {
    range: toRange(start, start.plus({ months: 1 })),
    year,
    month: m,
    isCurrent: year === today.year && m === today.month,
    isThisYear: year === today.year,
  };
}
