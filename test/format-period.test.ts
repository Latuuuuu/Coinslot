import { describe, expect, it } from 'vitest';
import {
  formatDailyBreakdown,
  formatMonth,
  formatMonthlyReport,
  formatSpendingComparison,
  formatWeek,
  monthLabel,
  splitMessage,
  weekLabel,
} from '../src/core/format.js';
import type { PeriodSummary } from '../src/core/ledger.js';
import { summarize, topSpending } from '../src/core/stats.js';
import type { Entry } from '../src/db/repository.js';

const TZ = 'Asia/Taipei';

let nextId = 1;
/** `taipei` like '2026-04-27 08:10' */
function entry(amount: number, note: string, taipei: string): Entry {
  const createdAt = new Date(`${taipei.replace(' ', 'T')}:00+08:00`).toISOString();
  return { id: nextId++, userId: 'u', amount, note, source: 'text', createdAt };
}

function summaryOf(entries: Entry[], range: PeriodSummary['range'], top = 3): PeriodSummary {
  return { range, totals: summarize(entries), topSpending: topSpending(entries, top), entries };
}

// ISO 2026-W18: Mon 4/27 – Sun 5/3
const w18 = { start: '2026-04-26T16:00:00.000Z', end: '2026-05-03T16:00:00.000Z' };
const w18Entries = [
  entry(-65, '咖啡', '2026-04-27 08:10'),
  entry(-119, '麥當勞', '2026-04-27 12:05'),
  entry(-114, '麥當勞', '2026-04-27 18:40'),
  entry(-1500, '房租', '2026-04-29 09:00'),
  entry(-65, '咖啡', '2026-05-01 08:05'),
  entry(500, '發票中獎', '2026-05-01 20:00'),
];

describe('labels', () => {
  it('weekLabel shows the ISO week number, optionally the week-year', () => {
    expect(weekLabel(w18, TZ)).toBe('W18 (4/27–5/3)');
    expect(weekLabel(w18, TZ, true)).toBe('W18 2026 (4/27–5/3)');
    const w1 = { start: '2025-12-28T16:00:00.000Z', end: '2026-01-04T16:00:00.000Z' };
    expect(weekLabel(w1, TZ, true)).toBe('W1 2026 (12/29–1/4)');
  });

  it('monthLabel uses an English month name regardless of host locale', () => {
    expect(monthLabel({ start: '2026-08-31T16:00:00.000Z', end: '' }, TZ)).toBe('Sep 2026');
  });
});

describe('formatWeek', () => {
  it('titles the current week with "This week" and the week number', () => {
    expect(formatWeek(summaryOf([], w18), TZ).split('\n')[0]).toBe('This week · W18 (4/27–5/3)');
  });

  it('titles a past week without "This week"', () => {
    expect(formatWeek(summaryOf([], w18), TZ, { current: false }).split('\n')[0]).toBe(
      'W18 (4/27–5/3)',
    );
    expect(
      formatWeek(summaryOf([], w18), TZ, { current: false, showYear: true }).split('\n')[0],
    ).toBe('W18 2026 (4/27–5/3)');
  });

  it('adds a per-day breakdown with detail', () => {
    expect(formatWeek(summaryOf(w18Entries, w18), TZ, { current: false, detail: true })).toBe(
      [
        'W18 (4/27–5/3)',
        '6 entries · Spent -$1,863 · Earned +$500 · Net -$1,363',
        '',
        'Top spending',
        '房租 -$1,500',
        '麥當勞 ×2 -$233',
        '咖啡 ×2 -$130',
        '',
        'Mon 4/27 · 3 entries · Spent -$298',
        '08:10 咖啡 -$65',
        '12:05 麥當勞 -$119',
        '18:40 麥當勞 -$114',
        '',
        'Wed 4/29 · 1 entry · Spent -$1,500',
        '09:00 房租 -$1,500',
        '',
        'Fri 5/1 · 2 entries · Spent -$65 · Earned +$500 · Net +$435',
        '08:05 咖啡 -$65',
        '20:00 發票中獎 +$500',
      ].join('\n'),
    );
  });

  it('does not add a breakdown when there is nothing logged', () => {
    expect(formatWeek(summaryOf([], w18), TZ, { current: false, detail: true })).toBe(
      'W18 (4/27–5/3)\nNothing logged yet.',
    );
  });
});

describe('formatDailyBreakdown', () => {
  it('skips empty days and groups by Taipei date, not UTC date', () => {
    const text = formatDailyBreakdown(
      [entry(-60, '宵夜', '2026-04-27 23:50'), entry(-70, '宵夜', '2026-04-28 00:10')],
      TZ,
    );
    expect(text).toBe(
      [
        'Mon 4/27 · 1 entry · Spent -$60',
        '23:50 宵夜 -$60',
        '',
        'Tue 4/28 · 1 entry · Spent -$70',
        '00:10 宵夜 -$70',
      ].join('\n'),
    );
  });
});

describe('formatMonth', () => {
  const sep = { start: '2026-08-31T16:00:00.000Z', end: '2026-09-30T16:00:00.000Z' };
  const entries = [
    entry(-1750, '修腳踏車', '2026-09-03 10:00'),
    entry(-119, '麥當勞', '2026-09-05 12:00'),
    entry(-119, '麥當勞', '2026-09-12 12:00'),
    entry(-233, '褲架 菜瓜布 抹布', '2026-09-14 20:00'),
    entry(-162, '肯德基', '2026-09-20 19:00'),
    entry(-100, '電影', '2026-09-21 21:00'),
    entry(-50, '飲料', '2026-09-22 15:00'),
    entry(42_000, '薪水', '2026-09-30 09:00'),
  ];

  it('shows five top spending groups', () => {
    expect(formatMonth(summaryOf(entries, sep, 5), TZ, { current: false })).toBe(
      [
        'Sep 2026',
        '8 entries · Spent -$2,533 · Earned +$42,000 · Net +$39,467',
        '',
        'Top spending',
        '修腳踏車 -$1,750',
        '麥當勞 ×2 -$238',
        '褲架 菜瓜布 抹布 -$233',
        '肯德基 -$162',
        '電影 -$100',
      ].join('\n'),
    );
  });

  it('titles the current month with "This month"', () => {
    expect(formatMonth(summaryOf([], sep), TZ)).toBe('This month · Sep 2026\nNothing logged yet.');
  });
});

describe('formatMonthlyReport', () => {
  const sep = { start: '2026-08-31T16:00:00.000Z', end: '2026-09-30T16:00:00.000Z' };

  it('compares spending with the previous month', () => {
    const entries = [entry(-2000, '房租', '2026-09-01 09:00')];
    expect(
      formatMonthlyReport(
        {
          ...summaryOf(entries, sep, 5),
          previousTotals: summarize([entry(-1500, 'x', '2026-08-01 09:00')]),
        },
        TZ,
      ),
    ).toBe(
      [
        '**Monthly report · Sep 2026**',
        '1 entry · Spent -$2,000',
        'Previous month: Spent -$1,500 · Change -$500 (spent more)',
        '',
        'Top spending',
        '房租 -$2,000',
      ].join('\n'),
    );
  });

  it('handles an empty month', () => {
    expect(formatMonthlyReport({ ...summaryOf([], sep), previousTotals: summarize([]) }, TZ)).toBe(
      [
        '**Monthly report · Sep 2026**',
        'Nothing logged this month.',
        'Previous month: no spending',
      ].join('\n'),
    );
  });
});

describe('formatSpendingComparison label', () => {
  it('defaults to "Last week"', () => {
    const t = summarize([]);
    expect(formatSpendingComparison(t, t)).toBe('Last week: no spending');
    expect(formatSpendingComparison(t, t, 'Previous month')).toBe('Previous month: no spending');
  });
});

describe('splitMessage', () => {
  it('returns short text unchanged', () => {
    expect(splitMessage('a\n\nb', 2000)).toEqual(['a\n\nb']);
    expect(splitMessage('x'.repeat(2000), 2000)).toEqual(['x'.repeat(2000)]);
  });

  it('splits at section boundaries and never exceeds the limit', () => {
    const sections = Array.from(
      { length: 10 },
      (_, i) => `Day ${i}\n${'line\n'.repeat(20).trim()}`,
    );
    const chunks = splitMessage(sections.join('\n\n'), 300);
    expect(chunks.every((c) => c.length <= 300)).toBe(true);
    expect(chunks.join('\n\n')).toBe(sections.join('\n\n'));
    // Each chunk starts at a section header.
    expect(chunks.every((c) => c.startsWith('Day '))).toBe(true);
  });

  it('splits an oversized section by line, keeping single newlines', () => {
    const big = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const chunks = splitMessage(`Header\n\n${big}`, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    // Only the original section break may appear as a blank line.
    expect(chunks.filter((c) => c.includes('\n\n'))).toEqual([
      expect.stringMatching(/^Header\n\n/),
    ]);
    // No line is lost, duplicated or reordered.
    const lines = chunks.flatMap((c) => c.split('\n')).filter((l) => l !== '');
    expect(lines).toEqual(['Header', ...big.split('\n')]);
  });

  it('hard-cuts a single line longer than the limit', () => {
    const chunks = splitMessage('y'.repeat(250), 100);
    expect(chunks).toEqual(['y'.repeat(100), 'y'.repeat(100), 'y'.repeat(50)]);
  });

  it('keeps a realistic month of detail under Discord limits', () => {
    const range = { start: '2026-08-31T16:00:00.000Z', end: '2026-09-30T16:00:00.000Z' };
    const many: Entry[] = [];
    for (let d = 1; d <= 30; d++) {
      for (let k = 0; k < 5; k++) {
        const day = String(d).padStart(2, '0');
        many.push(entry(-(100 + k), `午餐 便當 第${k}份`, `2026-09-${day} 1${k}:00`));
      }
    }
    const text = formatMonth(summaryOf(many, range, 5), TZ, { current: false, detail: true });
    const chunks = splitMessage(text, 1900);
    expect(text.length).toBeGreaterThan(2000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1900)).toBe(true);
    expect(chunks.join('\n\n')).toBe(text);
  });
});
