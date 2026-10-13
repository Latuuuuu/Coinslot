import { DateTime } from 'luxon';
import type { Entry } from '../db/repository.js';
import type { DaySummary, LogResult, PeriodReport, PeriodSummary } from './ledger.js';
import { MAX_AMOUNT } from './parse.js';
import type { UtcRange } from './period.js';
import { normalizeNote, summarize, type SpendingGroup, type Totals } from './stats.js';

// Plain-text formatting for replies and reports. Keep replies short: the bot should not nag.
// Discord uses a proportional font, so never pad with spaces to align columns.

const digits = (n: number) => Math.abs(n).toLocaleString('en-US');

/** Signed money: expense `-$1,200`, income `+$500`, zero `$0`. ASCII signs only. */
export function formatMoney(amount: number): string {
  if (amount < 0) return `-$${digits(amount)}`;
  if (amount > 0) return `+$${digits(amount)}`;
  return '$0';
}

function item(e: Entry): string {
  const note = normalizeNote(e.note);
  return note ? `${note} ${formatMoney(e.amount)}` : formatMoney(e.amount);
}

function entries(n: number): string {
  return n === 1 ? '1 entry' : `${n} entries`;
}

/** `5 entries · Spent -$2,383`, plus Earned/Net only when there is income. */
export function formatTotals(t: Totals): string {
  const parts = [entries(t.count), `Spent ${formatMoney(t.spent)}`];
  if (t.earned > 0) parts.push(`Earned ${formatMoney(t.earned)}`, `Net ${formatMoney(t.net)}`);
  return parts.join(' · ');
}

export function formatSpendingGroup(g: SpendingGroup): string {
  const label = g.note || '(no note)';
  const times = g.count > 1 ? ` ×${g.count}` : '';
  return `${label}${times} ${formatMoney(g.total)}`;
}

function topSpendingSection(groups: SpendingGroup[]): string[] {
  return groups.length ? ['', 'Top spending', ...groups.map(formatSpendingGroup)] : [];
}

export function formatLogResult(result: LogResult): string {
  if (result.ok) return `Logged ${item(result.entry)}`;
  switch (result.reason) {
    case 'empty':
    case 'no_amount':
      return 'No amount found. Try `午餐 -120` or `薪水 +500`.';
    case 'invalid_amount':
      return `Amount must be $1–$${digits(MAX_AMOUNT)}.`;
  }
}

export function formatUndo(entry: Entry | null): string {
  return entry ? `Undid ${item(entry)}` : 'Nothing to undo.';
}

// Fixed English locale so weekday/month names do not depend on the host.
const localTime = (iso: string, tz: string) => DateTime.fromISO(iso).setZone(tz).setLocale('en');

function timedItem(e: Entry, tz: string): string {
  return `${localTime(e.createdAt, tz).toFormat('HH:mm')} ${item(e)}`;
}

export function formatToday(summary: DaySummary, tz: string): string {
  if (summary.totals.count === 0) return 'Today: nothing logged yet.';
  const lines = summary.entries.map((e) => timedItem(e, tz));
  return [`Today: ${formatTotals(summary.totals)}`, '', ...lines].join('\n');
}

/** `W42 (10/12–10/18)`, with the ISO week-year when it is not this year. */
export function weekLabel(range: UtcRange, tz: string, showYear = false): string {
  const start = localTime(range.start, tz);
  const end = localTime(range.end, tz).minus({ days: 1 });
  const year = showYear ? ` ${start.weekYear}` : '';
  return `W${start.weekNumber}${year} (${start.toFormat('M/d')}–${end.toFormat('M/d')})`;
}

/** `Oct 2026` */
export function monthLabel(range: UtcRange, tz: string): string {
  return localTime(range.start, tz).toFormat('LLL yyyy');
}

/** One section per local day that has entries: a totals header, then one line per entry. */
export function formatDailyBreakdown(entries: readonly Entry[], tz: string): string {
  const days = new Map<string, Entry[]>();
  for (const e of entries) {
    const day = localTime(e.createdAt, tz).toISODate()!;
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  return [...days.values()]
    .map((dayEntries) => {
      const date = localTime(dayEntries[0]!.createdAt, tz).toFormat('ccc M/d');
      return [
        `${date} · ${formatTotals(summarize(dayEntries))}`,
        ...dayEntries.map((e) => timedItem(e, tz)),
      ].join('\n');
    })
    .join('\n\n');
}

export interface PeriodFormatOptions {
  /** Append every entry grouped by day. */
  detail?: boolean;
}

function formatPeriod(
  title: string,
  summary: PeriodSummary,
  tz: string,
  { detail = false }: PeriodFormatOptions,
): string {
  if (summary.totals.count === 0) return `${title}\nNothing logged yet.`;
  const lines = [title, formatTotals(summary.totals), ...topSpendingSection(summary.topSpending)];
  if (detail) lines.push('', formatDailyBreakdown(summary.entries, tz));
  return lines.join('\n');
}

export interface WeekFormatOptions extends PeriodFormatOptions {
  /** The week containing today: title starts with "This week". Default true. */
  current?: boolean;
  /** Show the week-year (used when the cross-year rule picked last year). */
  showYear?: boolean;
}

export function formatWeek(
  summary: PeriodSummary,
  tz: string,
  { current = true, showYear = false, ...rest }: WeekFormatOptions = {},
): string {
  const label = weekLabel(summary.range, tz, showYear);
  return formatPeriod(current ? `This week · ${label}` : label, summary, tz, rest);
}

export interface MonthFormatOptions extends PeriodFormatOptions {
  /** The month containing today: title starts with "This month". Default true. */
  current?: boolean;
}

export function formatMonth(
  summary: PeriodSummary,
  tz: string,
  { current = true, ...rest }: MonthFormatOptions = {},
): string {
  const label = monthLabel(summary.range, tz);
  return formatPeriod(current ? `This month · ${label}` : label, summary, tz, rest);
}

/**
 * Compares spending only. Change = this period's spent - the previous period's spent,
 * in the same sign convention: negative means more money went out this time.
 */
export function formatSpendingComparison(
  current: Totals,
  previous: Totals,
  label = 'Last week',
): string {
  if (previous.spent === 0) return `${label}: no spending`;
  const change = current.spent - previous.spent;
  const direction = change < 0 ? ' (spent more)' : change > 0 ? ' (spent less)' : '';
  return `${label}: Spent ${formatMoney(previous.spent)} · Change ${formatMoney(change)}${direction}`;
}

export function formatWeeklyReport(report: PeriodReport, tz: string): string {
  return [
    `**Weekly report · ${weekLabel(report.range, tz)}**`,
    report.totals.count === 0 ? 'Nothing logged this week.' : formatTotals(report.totals),
    formatSpendingComparison(report.totals, report.previousTotals, 'Last week'),
    ...topSpendingSection(report.topSpending),
  ].join('\n');
}

export function formatMonthlyReport(report: PeriodReport, tz: string): string {
  return [
    `**Monthly report · ${monthLabel(report.range, tz)}**`,
    report.totals.count === 0 ? 'Nothing logged this month.' : formatTotals(report.totals),
    formatSpendingComparison(report.totals, report.previousTotals, 'Previous month'),
    ...topSpendingSection(report.topSpending),
  ].join('\n');
}

/** Discord's per-message limit. */
export const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Split text into chunks of at most `limit` characters, preferring blank-line
 * (section) boundaries, then line boundaries; a single oversized line is hard-cut.
 */
export function splitMessage(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  // Each piece remembers the separator that preceded it, so packing restores the layout.
  const pieces: { sep: string; text: string }[] = [];
  text.split('\n\n').forEach((block, b) => {
    const blockSep = b === 0 ? '' : '\n\n';
    if (block.length <= limit) {
      pieces.push({ sep: blockSep, text: block });
      return;
    }
    block.split('\n').forEach((line, l) => {
      for (let i = 0; i === 0 || i < line.length; i += limit) {
        pieces.push({
          sep: l === 0 && i === 0 ? blockSep : i === 0 ? '\n' : '',
          text: line.slice(i, i + limit),
        });
      }
    });
  });

  const chunks: string[] = [];
  let current = '';
  for (const { sep, text: piece } of pieces) {
    if (current !== '' && current.length + sep.length + piece.length > limit) {
      chunks.push(current);
      current = piece; // a new message starts clean, without the separator
    } else {
      current = current === '' ? piece : current + sep + piece;
    }
  }
  if (current !== '') chunks.push(current);
  return chunks;
}

export function formatReminder(userId: string): string {
  return `<@${userId}> Nothing logged today. Spent it? Slot it.`;
}

function csvField(value: string | number): string {
  // Neutralize spreadsheet formulas (CSV injection) in free-text fields.
  const s = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV with a UTF-8 BOM so Excel opens Chinese notes correctly. `amount` stays a
 * plain signed integer (expense < 0) so it can be summed in a spreadsheet.
 */
export function toCsv(rows: Entry[], tz: string): string {
  const header = ['id', 'local_time', 'amount', 'note', 'source', 'created_at_utc'];
  const lines = rows.map((e) =>
    [
      e.id,
      DateTime.fromISO(e.createdAt).setZone(tz).toFormat('yyyy-MM-dd HH:mm:ss'),
      e.amount,
      e.note,
      e.source,
      e.createdAt,
    ]
      .map(csvField)
      .join(','),
  );
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
}
