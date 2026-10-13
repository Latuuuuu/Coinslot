import { DateTime } from 'luxon';
import type { Entry } from '../db/repository.js';
import { summarize, type Totals } from './stats.js';

/** Local calendar date (YYYY-MM-DD) of a UTC ISO timestamp. */
export function localDateOf(iso: string, tz: string): string {
  return DateTime.fromISO(iso).setZone(tz).toISODate()!;
}

/** Local wall-clock time (HH:mm) of a UTC ISO timestamp. */
export function localTimeOf(iso: string, tz: string): string {
  return DateTime.fromISO(iso).setZone(tz).toFormat('HH:mm');
}

export interface DayGroup {
  /** YYYY-MM-DD, local */
  date: string;
  totals: Totals;
  entries: Entry[];
}

/** Entries grouped by local day, in date order; days without entries are omitted. */
export function groupByLocalDay(entries: readonly Entry[], tz: string): DayGroup[] {
  const days = new Map<string, Entry[]>();
  for (const e of entries) {
    const date = localDateOf(e.createdAt, tz);
    const list = days.get(date);
    if (list) list.push(e);
    else days.set(date, [e]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, totals: summarize(list), entries: list }));
}
