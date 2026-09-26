import type { Entry, EntryRepository, EntrySource } from '../db/repository.js';
import { parseEntry, type ParseResult } from './parse.js';
import { dayRange, previousWeekRange, toUtcIso, weekRange } from './period.js';

export type LogResult =
  { ok: true; entry: Entry } | { ok: false; reason: Extract<ParseResult, { ok: false }>['reason'] };

export interface DaySummary {
  count: number;
  total: number;
  entries: Entry[];
}

export interface WeekSummary {
  count: number;
  total: number;
  /** Largest entries this week, biggest first (ties: earliest first). */
  top: Entry[];
}

export interface WeeklyReport extends WeekSummary {
  previousTotal: number;
  /** total - previousTotal */
  difference: number;
}

export interface LedgerOptions {
  repository: EntryRepository;
  timezone: string;
  now?: () => Date;
}

const TOP_COUNT = 3;

function sum(entries: Entry[]): number {
  return entries.reduce((acc, e) => acc + e.amount, 0);
}

function largest(entries: Entry[], n: number): Entry[] {
  return [...entries]
    .sort((a, b) => b.amount - a.amount || a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
    .slice(0, n);
}

/** Business logic for logging and querying expenses. Knows nothing about Discord. */
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
    return { count: entries.length, total: sum(entries), entries };
  }

  async hasEntryToday(userId: string): Promise<boolean> {
    return (await this.today(userId)).count > 0;
  }

  async week(userId: string): Promise<WeekSummary> {
    const { start, end } = weekRange(this.now(), this.tz);
    const entries = await this.repo.listBetween(userId, start, end);
    return { count: entries.length, total: sum(entries), top: largest(entries, TOP_COUNT) };
  }

  async weeklyReport(userId: string): Promise<WeeklyReport> {
    const { start, end } = previousWeekRange(this.now(), this.tz);
    const [current, previous] = await Promise.all([
      this.week(userId),
      this.repo.listBetween(userId, start, end),
    ]);
    const previousTotal = sum(previous);
    return { ...current, previousTotal, difference: current.total - previousTotal };
  }

  async all(userId: string): Promise<Entry[]> {
    return this.repo.listAll(userId);
  }
}
