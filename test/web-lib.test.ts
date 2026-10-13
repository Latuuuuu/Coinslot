import { describe, expect, it } from 'vitest';
import { addMonths, heatLevel, isoWeek, monthGrid } from '../web/src/lib/calendar.js';
import { compactMoney, formatMoney, parseSignedAmount } from '../web/src/lib/money.js';

describe('isoWeek', () => {
  it.each([
    ['2026-10-13', 42, 2026],
    ['2025-12-29', 1, 2026], // Monday of 2026-W01
    ['2026-01-01', 1, 2026],
    ['2027-01-01', 53, 2026], // Friday in 2026-W53
    ['2025-12-28', 52, 2025],
    ['2021-01-03', 53, 2020],
  ])('%s → W%i %i', (date, weekNumber, weekYear) => {
    expect(isoWeek(date)).toEqual({ weekNumber, weekYear });
  });
});

describe('monthGrid', () => {
  it('starts on Monday and covers the whole month', () => {
    const grid = monthGrid('2026-10'); // Oct 1 2026 is a Thursday
    expect(grid[0]!.days.map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(grid[0]!.days.map((d) => d.inMonth)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(grid.map((w) => w.weekNumber)).toEqual([40, 41, 42, 43, 44]);
    expect(grid.at(-1)!.days.at(-1)!.date).toBe('2026-11-01');
  });

  it('handles a month starting on Monday and a 6-row month', () => {
    expect(monthGrid('2026-06')[0]!.days[0]!.date).toBe('2026-06-01');
    expect(monthGrid('2026-08')).toHaveLength(6); // Aug 1 2026 is a Saturday
    expect(monthGrid('2027-02')).toHaveLength(4); // Feb 2027 starts on Monday, 28 days
  });

  it('labels the December/January week with its ISO week-year', () => {
    const last = monthGrid('2025-12').at(-1)!;
    expect(last).toMatchObject({ weekNumber: 1, weekYear: 2026 });
  });
});

describe('addMonths', () => {
  it('crosses year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });
});

describe('heatLevel', () => {
  it('scales spending against the busiest day', () => {
    expect(heatLevel(0, -1000)).toBe(0);
    expect(heatLevel(-1, -1000)).toBe(1);
    expect(heatLevel(-500, -1000)).toBe(2);
    expect(heatLevel(-1000, -1000)).toBe(4);
    expect(heatLevel(-100, 0)).toBe(0);
  });
});

describe('money helpers', () => {
  it('formatMoney matches the bot', () => {
    expect(formatMoney(-2383)).toBe('-$2,383');
    expect(formatMoney(500)).toBe('+$500');
    expect(formatMoney(0)).toBe('$0');
  });

  it('compactMoney keeps cells short', () => {
    expect(compactMoney(0)).toBe('');
    expect(compactMoney(-350)).toBe('-350');
    expect(compactMoney(-1000)).toBe('-1k');
    expect(compactMoney(-1234)).toBe('-1.2k');
    expect(compactMoney(-12_345)).toBe('-12k');
    expect(compactMoney(42_000)).toBe('+42k');
  });

  it('parseSignedAmount follows the typed-entry rules', () => {
    expect(parseSignedAmount('-120')).toBe(-120);
    expect(parseSignedAmount('120')).toBe(-120);
    expect(parseSignedAmount('+500')).toBe(500);
    expect(parseSignedAmount(' -1,200 ')).toBe(-1200);
    expect(parseSignedAmount('－１２０')).toBe(-120);
    expect(parseSignedAmount('0')).toBeNull();
    expect(parseSignedAmount('1.5')).toBeNull();
    expect(parseSignedAmount('-10,000,001')).toBeNull();
    expect(parseSignedAmount('abc')).toBeNull();
  });
});
