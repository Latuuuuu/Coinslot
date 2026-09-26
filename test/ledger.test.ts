import { beforeEach, describe, expect, it } from 'vitest';
import { Ledger } from '../src/core/ledger.js';
import { openDatabase, SqliteEntryRepository } from '../src/db/repository.js';

const USER = '423456789012345678';
const TZ = 'Asia/Taipei';

let clock: Date;
let ledger: Ledger;

function setNow(iso: string) {
  clock = new Date(iso);
}

async function logAt(iso: string, text: string) {
  setNow(iso);
  const result = await ledger.log(USER, text, 'text');
  if (!result.ok) throw new Error(`failed to log ${text}: ${result.reason}`);
  return result.entry;
}

beforeEach(() => {
  clock = new Date('2026-09-26T12:00:00+08:00');
  ledger = new Ledger({
    repository: new SqliteEntryRepository(openDatabase(':memory:')),
    timezone: TZ,
    now: () => clock,
  });
});

describe('Ledger.log', () => {
  it('stores expenses as negative amounts with a UTC timestamp', async () => {
    const result = await ledger.log(USER, '午餐 -120', 'slash');
    expect(result).toEqual({
      ok: true,
      entry: {
        id: 1,
        userId: USER,
        amount: -120,
        note: '午餐',
        source: 'slash',
        createdAt: '2026-09-26T04:00:00.000Z',
      },
    });
  });

  it('returns the parse error without writing', async () => {
    expect(await ledger.log(USER, '今天好累', 'text')).toEqual({ ok: false, reason: 'no_amount' });
    expect(await ledger.log(USER, '+0 薪水', 'text')).toEqual({
      ok: false,
      reason: 'invalid_amount',
    });
    expect(await ledger.all(USER)).toEqual([]);
  });

  it('stores income as a positive amount', async () => {
    const result = await ledger.log(USER, '+50,000 薪水', 'slash');
    expect(result).toMatchObject({
      ok: true,
      entry: { amount: 50_000, note: '薪水', source: 'slash' },
    });
    expect((await ledger.all(USER)).map((e) => e.amount)).toEqual([50_000]);
  });
});

describe('Ledger.undo', () => {
  it('removes the latest entry and excludes it from summaries', async () => {
    await logAt('2026-09-26T12:00:00+08:00', '-120 午餐');
    const last = await logAt('2026-09-26T13:00:00+08:00', '-85 飲料');

    expect(await ledger.undo(USER)).toEqual(last);
    expect((await ledger.today(USER)).totals).toMatchObject({ count: 1, spent: -120 });
    expect((await ledger.all(USER)).map((e) => e.note)).toEqual(['午餐']);
  });

  it('returns null when there is nothing left', async () => {
    await logAt('2026-09-26T12:00:00+08:00', '-120 午餐');
    await ledger.undo(USER);
    expect(await ledger.undo(USER)).toBeNull();
  });
});

describe('Ledger.today', () => {
  it('counts purchases by Taipei day, not UTC day', async () => {
    await logAt('2026-09-25T23:50:00+08:00', '-60 宵夜昨天');
    await logAt('2026-09-26T00:10:00+08:00', '-70 宵夜今天');
    await logAt('2026-09-26T12:00:00+08:00', '-120 午餐');

    setNow('2026-09-26T22:00:00+08:00');
    const today = await ledger.today(USER);
    expect(today.totals).toEqual({ count: 2, spent: -190, earned: 0, net: -190 });
    expect(today.entries.map((e) => e.note)).toEqual(['宵夜今天', '午餐']);
    expect(await ledger.hasEntryToday(USER)).toBe(true);

    setNow('2026-09-27T22:00:00+08:00');
    expect(await ledger.hasEntryToday(USER)).toBe(false);
  });

  it('includes income in totals and in the reminder check', async () => {
    await logAt('2026-09-26T09:00:00+08:00', '+500 發票中獎');
    setNow('2026-09-26T22:00:00+08:00');
    expect(await ledger.hasEntryToday(USER)).toBe(true);

    await logAt('2026-09-26T12:00:00+08:00', '-120 午餐');
    expect((await ledger.today(USER)).totals).toEqual({
      count: 2,
      spent: -120,
      earned: 500,
      net: 380,
    });
  });
});

describe('Ledger.week / weeklyReport', () => {
  beforeEach(async () => {
    // Previous week (Mon 2026-09-14 .. Sun 2026-09-20)
    await logAt('2026-09-14T00:00:00+08:00', '-500 上週一');
    await logAt('2026-09-20T23:59:00+08:00', '-300 上週日');
    // This week (Mon 2026-09-21 .. Sun 2026-09-27)
    await logAt('2026-09-21T00:00:00+08:00', '-100 a');
    await logAt('2026-09-22T12:00:00+08:00', '-1,200 耳機');
    await logAt('2026-09-23T12:00:00+08:00', '-300 b');
    await logAt('2026-09-24T12:00:00+08:00', '-300 c');
    await logAt('2026-09-27T23:00:00+08:00', '-50 d');
    // Next week
    await logAt('2026-09-28T00:00:00+08:00', '-999 下週');
  });

  it('summarizes the Monday-based week with top spending by note', async () => {
    await logAt('2026-09-25T12:00:00+08:00', '-250 a');
    await logAt('2026-09-25T13:00:00+08:00', '耳機 +5,000'); // resold; income never ranks
    setNow('2026-09-27T21:00:00+08:00');
    const week = await ledger.week(USER);
    expect(week.totals).toEqual({ count: 7, spent: -2200, earned: 5000, net: 2800 });
    expect(week.topSpending.map((g) => [g.note, g.total, g.count])).toEqual([
      ['耳機', -1200, 1],
      ['a', -350, 2],
      ['c', -300, 1], // ties with b on total and count; c (9/24) is more recent
    ]);
  });

  it('compares against the previous week', async () => {
    setNow('2026-09-27T21:00:00+08:00');
    const report = await ledger.weeklyReport(USER);
    expect(report.totals).toMatchObject({ count: 5, spent: -1950 });
    expect(report.previousTotals).toEqual({ count: 2, spent: -800, earned: 0, net: -800 });
  });

  it('handles an empty week', async () => {
    setNow('2026-10-12T21:00:00+08:00');
    expect(await ledger.weeklyReport(USER)).toEqual({
      range: { start: '2026-10-11T16:00:00.000Z', end: '2026-10-18T16:00:00.000Z' },
      totals: { count: 0, spent: 0, earned: 0, net: 0 },
      topSpending: [],
      previousTotals: { count: 0, spent: 0, earned: 0, net: 0 },
    });
  });
});
