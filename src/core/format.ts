import { DateTime } from 'luxon';
import type { Entry } from '../db/repository.js';
import type { DaySummary, LogResult, WeeklyReport, WeekSummary } from './ledger.js';
import { MAX_AMOUNT } from './parse.js';
import { normalizeNote, type SpendingGroup, type Totals } from './stats.js';

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

export function formatToday(summary: DaySummary, tz: string): string {
  if (summary.totals.count === 0) return 'Today: nothing logged yet.';
  const lines = summary.entries.map(
    (e) => `${DateTime.fromISO(e.createdAt).setZone(tz).toFormat('HH:mm')} ${item(e)}`,
  );
  return [`Today: ${formatTotals(summary.totals)}`, '', ...lines].join('\n');
}

function weekLabel(week: WeekSummary, tz: string): string {
  const start = DateTime.fromISO(week.range.start).setZone(tz);
  const end = DateTime.fromISO(week.range.end).setZone(tz).minus({ days: 1 });
  return `${start.toFormat('M/d')}–${end.toFormat('M/d')}`;
}

export function formatWeek(week: WeekSummary, tz: string): string {
  const header = `This week (${weekLabel(week, tz)})`;
  if (week.totals.count === 0) return `${header}\nNothing logged yet.`;
  return [header, formatTotals(week.totals), ...topSpendingSection(week.topSpending)].join('\n');
}

/**
 * Compares spending only. Change = this week's spent - last week's spent, in the
 * same sign convention: negative means more money went out this week.
 */
export function formatSpendingComparison(current: Totals, previous: Totals): string {
  if (previous.spent === 0) return 'Last week: no spending';
  const change = current.spent - previous.spent;
  const direction = change < 0 ? ' (spent more)' : change > 0 ? ' (spent less)' : '';
  return `Last week: Spent ${formatMoney(previous.spent)} · Change ${formatMoney(change)}${direction}`;
}

export function formatWeeklyReport(report: WeeklyReport, tz: string): string {
  return [
    `**Weekly report ${weekLabel(report, tz)}**`,
    report.totals.count === 0 ? 'Nothing logged this week.' : formatTotals(report.totals),
    formatSpendingComparison(report.totals, report.previousTotals),
    ...topSpendingSection(report.topSpending),
  ].join('\n');
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
