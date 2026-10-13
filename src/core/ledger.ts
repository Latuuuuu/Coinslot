import type { Entry, EntryRepository, EntrySource } from '../db/repository.js';
import { MAX_AMOUNT, parseEntry, type ParseResult } from './parse.js';
import {
  dayRange,
  localDayRange,
  monthRange,
  previousMonthRange,
  previousWeekRange,
  resolveMonth,
  resolveWeek,
  toUtcIso,
  weekRange,
  type MonthRef,
  type ResolveWeekResult,
  type UtcRange,
} from './period.js';
import { summarize, topSpending, type SpendingGroup, type Totals } from './stats.js';

export type LogResult =
  { ok: true; entry: Entry } | { ok: false; reason: Extract<ParseResult, { ok: false }>['reason'] };

export interface DaySummary {
  totals: Totals;
  entries: Entry[];
}

/** Any span of time: a week, a month, ... */
export interface PeriodSummary {
  range: UtcRange;
  totals: Totals;
  /** Expenses grouped by note, biggest spending first. */
  topSpending: SpendingGroup[];
  /** All active entries in the range, oldest first (for the detailed view). */
  entries: Entry[];
}

/** A period compared with the one before it (weekly / monthly reports). */
export interface PeriodReport extends PeriodSummary {
  previousTotals: Totals;
}

export interface LedgerOptions {
  repository: EntryRepository;
  timezone: string;
  now?: () => Date;
}

/**
 * Each chat surface undoes only what it logged itself. Entries added from the
 * calendar ('calendar') are never undone; they are deleted from the calendar.
 */
export type UndoScope = 'discord' | 'web';
export const UNDO_SOURCES: Record<UndoScope, readonly EntrySource[]> = {
  discord: ['text', 'slash'],
  web: ['web'],
};

export interface EntryEdit {
  /** Signed: expense < 0, income > 0. */
  amount?: number;
  note?: string;
  /** UTC ISO 8601 */
  createdAt?: string;
}

export type EditResult =
  | { ok: true; entry: Entry }
  | { ok: false; reason: 'not_found' | 'invalid_amount' | 'invalid_time' };

export const WEEK_TOP_COUNT = 3;
export const MONTH_TOP_COUNT = 5;

/** Business logic for logging and querying entries. Knows nothing about Discord. */
export class Ledger {
  private readonly repo: EntryRepository;
  private readonly tz: string;
  private readonly now: () => Date;

  constructor({ repository, timezone, now = () => new Date() }: LedgerOptions) {
    this.repo = repository;
    this.tz = timezone;
    this.now = now;
  }

  /** Parse and store `text`. `createdAt` (UTC ISO) back-dates the entry; default is now. */
  async log(
    userId: string,
    text: string,
    source: EntrySource,
    createdAt?: string,
  ): Promise<LogResult> {
    const parsed = parseEntry(text);
    if (!parsed.ok) return parsed;
    const entry = await this.repo.insert({
      userId,
      amount: parsed.amount,
      note: parsed.note,
      source,
      createdAt: createdAt ?? toUtcIso(this.now()),
    });
    return { ok: true, entry };
  }

  /**
   * Soft-deletes the most recent active entry logged from `scope` and returns it,
   * or null if there is none. Discord and the web chat never undo each other's entries.
   */
  async undo(userId: string, scope: UndoScope = 'discord'): Promise<Entry | null> {
    const last = await this.repo.findLastActive(userId, UNDO_SOURCES[scope]);
    if (!last) return null;
    const deleted = await this.repo.softDelete(last.id, toUtcIso(this.now()));
    return deleted ? last : null;
  }

  async entry(userId: string, id: number): Promise<Entry | null> {
    return this.repo.findById(userId, id);
  }

  /** Edit amount / note / time of an entry. Same amount rules as typed input. */
  async edit(userId: string, id: number, changes: EntryEdit): Promise<EditResult> {
    const current = await this.repo.findById(userId, id);
    if (!current) return { ok: false, reason: 'not_found' };

    const amount = changes.amount ?? current.amount;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) {
      return { ok: false, reason: 'invalid_amount' };
    }
    const createdAt = changes.createdAt ?? current.createdAt;
    if (Number.isNaN(Date.parse(createdAt))) return { ok: false, reason: 'invalid_time' };

    const updated = await this.repo.update(
      userId,
      id,
      {
        amount,
        note: (changes.note ?? current.note).trim().replace(/\s+/g, ' '),
        createdAt: toUtcIso(new Date(createdAt)),
      },
      toUtcIso(this.now()),
    );
    return updated ? { ok: true, entry: updated } : { ok: false, reason: 'not_found' };
  }

  /** Soft delete by id (calendar). Returns the deleted entry, or null if not found. */
  async remove(userId: string, id: number): Promise<Entry | null> {
    const current = await this.repo.findById(userId, id);
    if (!current) return null;
    return (await this.repo.softDelete(id, toUtcIso(this.now()))) ? current : null;
  }

  /** Entries of the local day `date` (YYYY-MM-DD); null for an invalid date. */
  async day(userId: string, date: string): Promise<DaySummary | null> {
    const range = localDayRange(date, this.tz);
    if (!range) return null;
    const entries = await this.repo.listBetween(userId, range.start, range.end);
    return { totals: summarize(entries), entries };
  }

  get timezone(): string {
    return this.tz;
  }

  /** The ledger's clock (tests inject a fixed one). */
  currentTime(): Date {
    return this.now();
  }

  async today(userId: string): Promise<DaySummary> {
    const { start, end } = dayRange(this.now(), this.tz);
    const entries = await this.repo.listBetween(userId, start, end);
    return { totals: summarize(entries), entries };
  }

  /** Any entry counts, expense or income. */
  async hasEntryToday(userId: string): Promise<boolean> {
    return (await this.today(userId)).totals.count > 0;
  }

  async period(userId: string, range: UtcRange, topCount: number): Promise<PeriodSummary> {
    const entries = await this.repo.listBetween(userId, range.start, range.end);
    return {
      range,
      totals: summarize(entries),
      topSpending: topSpending(entries, topCount),
      entries,
    };
  }

  /** Resolve `/week [n]` relative to now (see resolveWeek for the cross-year rule). */
  weekRef(week?: number): ResolveWeekResult {
    return resolveWeek(this.now(), this.tz, week);
  }

  /** Resolve `/month [n]` relative to now (see resolveMonth for the cross-year rule). */
  monthRef(month?: number): MonthRef {
    return resolveMonth(this.now(), this.tz, month);
  }

  async week(userId: string): Promise<PeriodSummary> {
    return this.period(userId, weekRange(this.now(), this.tz), WEEK_TOP_COUNT);
  }

  async month(userId: string): Promise<PeriodSummary> {
    return this.period(userId, monthRange(this.now(), this.tz), MONTH_TOP_COUNT);
  }

  /** This week vs last week. */
  async weeklyReport(userId: string): Promise<PeriodReport> {
    const { start, end } = previousWeekRange(this.now(), this.tz);
    const [current, previous] = await Promise.all([
      this.week(userId),
      this.repo.listBetween(userId, start, end),
    ]);
    return { ...current, previousTotals: summarize(previous) };
  }

  /** Sent on the 1st: last month vs the month before it. */
  async monthlyReport(userId: string): Promise<PeriodReport> {
    const lastMonth = previousMonthRange(this.now(), this.tz);
    const monthBefore = previousMonthRange(new Date(lastMonth.start), this.tz);
    const [current, previous] = await Promise.all([
      this.period(userId, lastMonth, MONTH_TOP_COUNT),
      this.repo.listBetween(userId, monthBefore.start, monthBefore.end),
    ]);
    return { ...current, previousTotals: summarize(previous) };
  }

  async all(userId: string): Promise<Entry[]> {
    return this.repo.listAll(userId);
  }
}
