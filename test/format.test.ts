import { describe, expect, it } from 'vitest';
import {
  formatLogResult,
  formatReminder,
  formatToday,
  formatUndo,
  formatWeek,
  formatWeeklyReport,
  toCsv,
} from '../src/core/format.js';
import type { Entry } from '../src/db/repository.js';

const TZ = 'Asia/Taipei';

function entry(id: number, amount: number, note: string, createdAt: string): Entry {
  return { id, userId: 'u', amount, note, source: 'text', createdAt };
}

const lunch = entry(1, 120, '午餐', '2026-09-26T04:05:00.000Z');
const headphones = entry(2, 1200, '耳機', '2026-09-26T16:10:00.000Z');
const week = { start: '2026-09-20T16:00:00.000Z', end: '2026-09-27T16:00:00.000Z' };

describe('formatLogResult', () => {
  it('formats success in one line', () => {
    expect(formatLogResult({ ok: true, entry: lunch })).toBe('Logged 午餐 -120');
    expect(formatLogResult({ ok: true, entry: entry(3, 1200, '', lunch.createdAt) })).toBe(
      'Logged -1,200',
    );
  });

  it('explains errors briefly', () => {
    expect(formatLogResult({ ok: false, reason: 'no_amount' })).toMatch(/No amount/);
    expect(formatLogResult({ ok: false, reason: 'invalid_amount' })).toBe(
      'Amount must be 1–10,000,000 (expenses only).',
    );
  });
});

describe('formatUndo', () => {
  it('names the removed entry', () => {
    expect(formatUndo(lunch)).toBe('Undid 午餐 -120');
    expect(formatUndo(null)).toBe('Nothing to undo.');
  });
});

describe('formatToday', () => {
  it('lists entries with Taipei times', () => {
    expect(formatToday({ count: 2, total: 1320, entries: [lunch, headphones] }, TZ)).toBe(
      'Today: 2 entries, 1,320\n`12:05` 午餐 -120\n`00:10` 耳機 -1,200',
    );
  });

  it('handles an empty day', () => {
    expect(formatToday({ count: 0, total: 0, entries: [] }, TZ)).toBe('Today: nothing logged yet.');
  });
});

describe('formatWeek', () => {
  it('shows the Monday–Sunday label and top entries', () => {
    expect(formatWeek({ range: week, count: 2, total: 1320, top: [headphones, lunch] }, TZ)).toBe(
      'This week (9/21–9/27): 2 entries, 1,320\nTop: 耳機 -1,200 · 午餐 -120',
    );
  });

  it('handles an empty week', () => {
    expect(formatWeek({ range: week, count: 0, total: 0, top: [] }, TZ)).toBe(
      'This week (9/21–9/27): nothing logged yet.',
    );
  });
});

describe('formatWeeklyReport', () => {
  const base = { range: week, count: 1, total: 1200, top: [headphones] };

  it('compares with last week', () => {
    expect(formatWeeklyReport({ ...base, previousTotal: 800, difference: 400 }, TZ)).toBe(
      '**Weekly report 9/21–9/27**\n1,200 across 1 entry, +400 vs last week (800)\nTop: 耳機 -1,200',
    );
    expect(formatWeeklyReport({ ...base, previousTotal: 2000, difference: -800 }, TZ)).toContain(
      '-800 vs last week (2,000)',
    );
    expect(formatWeeklyReport({ ...base, previousTotal: 1200, difference: 0 }, TZ)).toContain(
      'same as last week (1,200)',
    );
    expect(formatWeeklyReport({ ...base, previousTotal: 0, difference: 1200 }, TZ)).toContain(
      'no entries last week',
    );
  });
});

describe('formatReminder', () => {
  it('mentions the owner', () => {
    expect(formatReminder('42')).toBe('<@42> Nothing logged today. Spent it? Slot it.');
  });
});

describe('toCsv', () => {
  it('writes a BOM, header and escaped rows', () => {
    const csv = toCsv(
      [lunch, entry(3, 50, '咖啡, "大杯"', lunch.createdAt), entry(4, 10, '=1+1', lunch.createdAt)],
      TZ,
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'id,local_time,amount,note,source,created_at_utc',
      '1,2026-09-26 12:05:00,120,午餐,text,2026-09-26T04:05:00.000Z',
      '3,2026-09-26 12:05:00,50,"咖啡, ""大杯""",text,2026-09-26T04:05:00.000Z',
      "4,2026-09-26 12:05:00,10,'=1+1,text,2026-09-26T04:05:00.000Z",
      '',
    ]);
  });
});
