import { describe, expect, it } from 'vitest';
import {
  formatLogResult,
  formatMoney,
  formatReminder,
  formatSpendingComparison,
  formatSpendingGroup,
  formatToday,
  formatTotals,
  formatUndo,
  formatWeek,
  formatWeeklyReport,
  toCsv,
} from '../src/core/format.js';
import { summarize, topSpending, type Totals } from '../src/core/stats.js';
import type { Entry } from '../src/db/repository.js';

const TZ = 'Asia/Taipei';
const week = { start: '2026-09-20T16:00:00.000Z', end: '2026-09-27T16:00:00.000Z' };

let nextId = 1;
function entry(amount: number, note: string, createdAt: string): Entry {
  return { id: nextId++, userId: 'u', amount, note, source: 'text', createdAt };
}

// The example day from the spec (Taipei 23:21–23:24 on 9/26).
const day = [
  entry(-119, '麥當勞', '2026-09-26T15:21:00.000Z'),
  entry(-119, '麥當勞', '2026-09-26T15:22:00.000Z'),
  entry(-162, '肯德基', '2026-09-26T15:22:30.000Z'),
  entry(-1750, '修腳踏車', '2026-09-26T15:23:00.000Z'),
  entry(-233, '褲架 菜瓜布 抹布', '2026-09-26T15:24:00.000Z'),
];

const totals = (t: Partial<Totals>): Totals => ({ count: 1, spent: 0, earned: 0, net: 0, ...t });

describe('formatMoney', () => {
  it('signs expenses and income with ASCII characters', () => {
    expect(formatMoney(-119)).toBe('-$119');
    expect(formatMoney(500)).toBe('+$500');
  });

  it('handles the smallest non-zero values', () => {
    expect(formatMoney(-1)).toBe('-$1');
    expect(formatMoney(1)).toBe('+$1');
  });

  it('adds thousands separators', () => {
    expect(formatMoney(-999)).toBe('-$999');
    expect(formatMoney(-1000)).toBe('-$1,000');
    expect(formatMoney(-2383)).toBe('-$2,383');
    expect(formatMoney(10_000_000)).toBe('+$10,000,000');
  });

  it('renders zero without a sign', () => {
    expect(formatMoney(0)).toBe('$0');
  });

  it('never uses a Unicode minus', () => {
    expect(formatMoney(-5)).not.toMatch(/[−－]/);
  });
});

describe('formatTotals', () => {
  it('shows only Spent when there is no income', () => {
    expect(formatTotals(summarize(day))).toBe('5 entries · Spent -$2,383');
    expect(formatTotals(totals({ count: 1, spent: -120, net: -120 }))).toBe(
      '1 entry · Spent -$120',
    );
  });

  it('adds Earned and Net when there is income', () => {
    expect(formatTotals(summarize([...day, entry(500, '薪水', day[0]!.createdAt)]))).toBe(
      '6 entries · Spent -$2,383 · Earned +$500 · Net -$1,883',
    );
  });

  it('handles income only and positive net', () => {
    expect(formatTotals(totals({ spent: 0, earned: 500, net: 500 }))).toBe(
      '1 entry · Spent $0 · Earned +$500 · Net +$500',
    );
  });
});

describe('formatSpendingGroup', () => {
  it('adds ×n only for more than one entry', () => {
    expect(formatSpendingGroup({ note: '修腳踏車', total: -1750, count: 1, lastAt: '' })).toBe(
      '修腳踏車 -$1,750',
    );
    expect(formatSpendingGroup({ note: '麥當勞', total: -238, count: 2, lastAt: '' })).toBe(
      '麥當勞 ×2 -$238',
    );
  });

  it('labels empty notes', () => {
    expect(formatSpendingGroup({ note: '', total: -80, count: 2, lastAt: '' })).toBe(
      '(no note) ×2 -$80',
    );
  });
});

describe('formatLogResult / formatUndo', () => {
  it('uses signed money', () => {
    expect(formatLogResult({ ok: true, entry: entry(-120, '午餐', day[0]!.createdAt) })).toBe(
      'Logged 午餐 -$120',
    );
    expect(formatLogResult({ ok: true, entry: entry(-1200, '', day[0]!.createdAt) })).toBe(
      'Logged -$1,200',
    );
    expect(formatUndo(entry(-120, '午餐', day[0]!.createdAt))).toBe('Undid 午餐 -$120');
    expect(formatLogResult({ ok: true, entry: entry(500, '薪水', day[0]!.createdAt) })).toBe(
      'Logged 薪水 +$500',
    );
    expect(formatUndo(entry(500, '薪水', day[0]!.createdAt))).toBe('Undid 薪水 +$500');
    expect(formatUndo(null)).toBe('Nothing to undo.');
  });

  it('explains errors briefly', () => {
    expect(formatLogResult({ ok: false, reason: 'no_amount' })).toBe(
      'No amount found. Try `午餐 -120` or `薪水 +500`.',
    );
    expect(formatLogResult({ ok: false, reason: 'invalid_amount' })).toBe(
      'Amount must be $1–$10,000,000.',
    );
  });
});

describe('formatToday', () => {
  it('matches the spec example', () => {
    expect(formatToday({ totals: summarize(day), entries: day }, TZ)).toBe(
      [
        'Today: 5 entries · Spent -$2,383',
        '',
        '23:21 麥當勞 -$119',
        '23:22 麥當勞 -$119',
        '23:22 肯德基 -$162',
        '23:23 修腳踏車 -$1,750',
        '23:24 褲架 菜瓜布 抹布 -$233',
      ].join('\n'),
    );
  });

  it('shows income lines and Earned/Net', () => {
    const withIncome = [day[0]!, entry(500, '發票中獎', '2026-09-26T15:30:00.000Z')];
    expect(formatToday({ totals: summarize(withIncome), entries: withIncome }, TZ)).toBe(
      [
        'Today: 2 entries · Spent -$119 · Earned +$500 · Net +$381',
        '',
        '23:21 麥當勞 -$119',
        '23:30 發票中獎 +$500',
      ].join('\n'),
    );
  });

  it('handles an empty day', () => {
    expect(formatToday({ totals: summarize([]), entries: [] }, TZ)).toBe(
      'Today: nothing logged yet.',
    );
  });
});

describe('formatWeek', () => {
  it('matches the spec example, one item per line', () => {
    expect(
      formatWeek({ range: week, totals: summarize(day), topSpending: topSpending(day) }, TZ),
    ).toBe(
      [
        'This week (9/21–9/27)',
        '5 entries · Spent -$2,383',
        '',
        'Top spending',
        '修腳踏車 -$1,750',
        '麥當勞 ×2 -$238',
        '褲架 菜瓜布 抹布 -$233',
      ].join('\n'),
    );
  });

  it('omits Top spending when there are no expenses', () => {
    const income = [entry(500, '薪水', day[0]!.createdAt)];
    expect(
      formatWeek({ range: week, totals: summarize(income), topSpending: topSpending(income) }, TZ),
    ).toBe(['This week (9/21–9/27)', '1 entry · Spent $0 · Earned +$500 · Net +$500'].join('\n'));
  });

  it('handles an empty week', () => {
    expect(formatWeek({ range: week, totals: summarize([]), topSpending: [] }, TZ)).toBe(
      'This week (9/21–9/27)\nNothing logged yet.',
    );
  });
});

describe('formatSpendingComparison', () => {
  const current = totals({ spent: -2383 });

  it('compares spending only, with signed money', () => {
    expect(formatSpendingComparison(current, totals({ spent: -1200 }))).toBe(
      'Last week: Spent -$1,200 · Change -$1,183 (spent more)',
    );
    expect(formatSpendingComparison(current, totals({ spent: -3000 }))).toBe(
      'Last week: Spent -$3,000 · Change +$617 (spent less)',
    );
    expect(formatSpendingComparison(current, totals({ spent: -2383 }))).toBe(
      'Last week: Spent -$2,383 · Change $0',
    );
  });

  it('ignores income when comparing', () => {
    expect(
      formatSpendingComparison(current, totals({ spent: -1200, earned: 99_999, net: 98_799 })),
    ).toBe('Last week: Spent -$1,200 · Change -$1,183 (spent more)');
  });

  it('handles a week without spending', () => {
    expect(formatSpendingComparison(current, totals({ count: 0 }))).toBe('Last week: no spending');
  });
});

describe('formatWeeklyReport', () => {
  it('shows totals, spending comparison and top spending on separate lines', () => {
    expect(
      formatWeeklyReport(
        {
          range: week,
          totals: summarize(day),
          topSpending: topSpending(day),
          previousTotals: totals({ spent: -1200 }),
        },
        TZ,
      ),
    ).toBe(
      [
        '**Weekly report 9/21–9/27**',
        '5 entries · Spent -$2,383',
        'Last week: Spent -$1,200 · Change -$1,183 (spent more)',
        '',
        'Top spending',
        '修腳踏車 -$1,750',
        '麥當勞 ×2 -$238',
        '褲架 菜瓜布 抹布 -$233',
      ].join('\n'),
    );
  });

  it('handles an empty week', () => {
    expect(
      formatWeeklyReport(
        { range: week, totals: summarize([]), topSpending: [], previousTotals: summarize([]) },
        TZ,
      ),
    ).toBe(
      ['**Weekly report 9/21–9/27**', 'Nothing logged this week.', 'Last week: no spending'].join(
        '\n',
      ),
    );
  });
});

describe('formatReminder', () => {
  it('mentions the owner', () => {
    expect(formatReminder('42')).toBe('<@42> Nothing logged today. Spent it? Slot it.');
  });
});

describe('toCsv', () => {
  it('keeps amounts as plain signed integers and escapes notes', () => {
    const at = '2026-09-26T04:05:00.000Z';
    const csv = toCsv(
      [
        { ...entry(-1200, '午餐', at), id: 1 },
        { ...entry(500, '薪水', at), id: 2 },
        { ...entry(-50, '咖啡, "大杯"', at), id: 3 },
        { ...entry(-10, '=1+1', at), id: 4 },
      ],
      TZ,
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'id,local_time,amount,note,source,created_at_utc',
      '1,2026-09-26 12:05:00,-1200,午餐,text,2026-09-26T04:05:00.000Z',
      '2,2026-09-26 12:05:00,500,薪水,text,2026-09-26T04:05:00.000Z',
      '3,2026-09-26 12:05:00,-50,"咖啡, ""大杯""",text,2026-09-26T04:05:00.000Z',
      "4,2026-09-26 12:05:00,-10,'=1+1,text,2026-09-26T04:05:00.000Z",
      '',
    ]);
  });
});
