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
