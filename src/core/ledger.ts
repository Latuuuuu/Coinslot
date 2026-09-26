import type { Entry, EntryRepository, EntrySource } from '../db/repository.js';
import { parseEntry, type ParseResult } from './parse.js';
import { dayRange, previousWeekRange, toUtcIso, weekRange, type UtcRange } from './period.js';
import { summarize, topSpending, type SpendingGroup, type Totals } from './stats.js';

export type LogResult =
  { ok: true; entry: Entry } | { ok: false; reason: Extract<ParseResult, { ok: false }>['reason'] };

export interface DaySummary {
  totals: Totals;
  entries: Entry[];
}

export interface WeekSummary {
  /** The week's UTC range (Monday 00:00 local to next Monday 00:00 local). */
  range: UtcRange;
  totals: Totals;
  /** Expenses grouped by note, biggest spending first. */
  topSpending: SpendingGroup[];
}

export interface WeeklyReport extends WeekSummary {
  previousTotals: Totals;
}

export interface LedgerOptions {
  repository: EntryRepository;
  timezone: string;
  now?: () => Date;
}

const TOP_COUNT = 3;

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

  async log(userId: string, text: string, source: EntrySource): Promise<LogResult> {
    const parsed = parseEntry(text);
    if (!parsed.ok) return parsed;
    const entry = await this.repo.insert({
      userId,
      amount: parsed.amount,
      note: parsed.note,
      source,
      createdAt: toUtcIso(this.now()),
    });
    return { ok: true, entry };
  }

  /** Soft-deletes the most recent active entry and returns it, or null if there is none. */
  async undo(userId: string): Promise<Entry | null> {
    const last = await this.repo.findLastActive(userId);
    if (!last) return null;
    const deleted = await this.repo.softDelete(last.id, toUtcIso(this.now()));
    return deleted ? last : null;
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

  async week(userId: string): Promise<WeekSummary> {
    const range = weekRange(this.now(), this.tz);
    const entries = await this.repo.listBetween(userId, range.start, range.end);
    return { range, totals: summarize(entries), topSpending: topSpending(entries, TOP_COUNT) };
  }

  async weeklyReport(userId: string): Promise<WeeklyReport> {
    const { start, end } = previousWeekRange(this.now(), this.tz);
    const [current, previous] = await Promise.all([
      this.week(userId),
      this.repo.listBetween(userId, start, end),
    ]);
    return { ...current, previousTotals: summarize(previous) };
  }

  async all(userId: string): Promise<Entry[]> {
    return this.repo.listAll(userId);
  }
}
