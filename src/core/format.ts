import { DateTime } from 'luxon';
import type { Entry } from '../db/repository.js';
import type { DaySummary, LogResult, WeeklyReport, WeekSummary } from './ledger.js';
import { MAX_AMOUNT } from './parse.js';

// Plain-text formatting for replies and reports. Keep replies short: the bot should not nag.

const money = (n: number) => n.toLocaleString('en-US');

function item(e: Entry): string {
  return e.note ? `${e.note} -${money(e.amount)}` : `-${money(e.amount)}`;
}

function entries(n: number): string {
  return n === 1 ? '1 entry' : `${n} entries`;
}

export function formatLogResult(result: LogResult): string {
  if (result.ok) return `Logged ${item(result.entry)}`;
  switch (result.reason) {
    case 'empty':
    case 'no_amount':
      return 'No amount found. Try `午餐 -120`.';
    case 'invalid_amount':
      return `Amount must be 1–${money(MAX_AMOUNT)} (expenses only).`;
  }
}

export function formatUndo(entry: Entry | null): string {
  return entry ? `Undid ${item(entry)}` : 'Nothing to undo.';
}

export function formatToday(summary: DaySummary, tz: string): string {
  if (summary.count === 0) return 'Today: nothing logged yet.';
  const lines = summary.entries.map(
    (e) => `\`${DateTime.fromISO(e.createdAt).setZone(tz).toFormat('HH:mm')}\` ${item(e)}`,
  );
  return [`Today: ${entries(summary.count)}, ${money(summary.total)}`, ...lines].join('\n');
}

function topLine(top: Entry[]): string[] {
  return top.length ? [`Top: ${top.map(item).join(' · ')}`] : [];
}

function weekLabel(week: WeekSummary, tz: string): string {
  const start = DateTime.fromISO(week.range.start).setZone(tz);
  const end = DateTime.fromISO(week.range.end).setZone(tz).minus({ days: 1 });
  return `${start.toFormat('M/d')}–${end.toFormat('M/d')}`;
}

export function formatWeek(week: WeekSummary, tz: string): string {
  if (week.count === 0) return `This week (${weekLabel(week, tz)}): nothing logged yet.`;
  return [
    `This week (${weekLabel(week, tz)}): ${entries(week.count)}, ${money(week.total)}`,
    ...topLine(week.top),
  ].join('\n');
}

export function formatWeeklyReport(report: WeeklyReport, tz: string): string {
  const diff = report.difference;
  const comparison =
    report.previousTotal === 0
      ? 'no entries last week'
      : diff === 0
        ? `same as last week (${money(report.previousTotal)})`
        : `${diff > 0 ? '+' : '-'}${money(Math.abs(diff))} vs last week (${money(report.previousTotal)})`;
  return [
    `**Weekly report ${weekLabel(report, tz)}**`,
    `${money(report.total)} across ${entries(report.count)}, ${comparison}`,
    ...topLine(report.top),
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

/** CSV with a UTF-8 BOM so Excel opens Chinese notes correctly. */
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
