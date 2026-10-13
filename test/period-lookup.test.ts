import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { monthRange, previousMonthRange, resolveMonth, resolveWeek } from '../src/core/period.js';

const TZ = 'Asia/Taipei';
const at = (iso: string) => new Date(iso);

// Same guard as period.test.ts: results must not depend on the process zone.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('monthRange / previousMonthRange', () => {
  it('maps a Taipei month to UTC 16:00 boundaries', () => {
    expect(monthRange(at('2026-10-13T12:00:00+08:00'), TZ)).toEqual({
      start: '2026-09-30T16:00:00.000Z',
      end: '2026-10-31T16:00:00.000Z',
    });
  });

  it('puts 10/1 00:30 Taipei (9/30 UTC) in October', () => {
    expect(monthRange(at('2026-09-30T16:30:00Z'), TZ).start).toBe('2026-09-30T16:00:00.000Z');
  });

  it('handles February in leap and normal years', () => {
    expect(monthRange(at('2028-02-10T12:00:00+08:00'), TZ).end).toBe('2028-02-29T16:00:00.000Z');
    expect(monthRange(at('2026-02-10T12:00:00+08:00'), TZ).end).toBe('2026-02-28T16:00:00.000Z');
  });

  it('returns the previous month, across a year boundary', () => {
    expect(previousMonthRange(at('2027-01-05T12:00:00+08:00'), TZ)).toEqual({
      start: '2026-11-30T16:00:00.000Z',
      end: '2026-12-31T16:00:00.000Z',
    });
  });
});

describe('resolveWeek', () => {
  const now = at('2026-10-13T12:00:00+08:00'); // Tuesday of ISO week 42, 2026

  it('defaults to the current week', () => {
    expect(resolveWeek(now, TZ)).toEqual({
      ok: true,
      range: { start: '2026-10-11T16:00:00.000Z', end: '2026-10-18T16:00:00.000Z' },
      weekYear: 2026,
      weekNumber: 42,
      isCurrent: true,
      isThisYear: true,
    });
  });

  it('treats the current week number like the default', () => {
    expect(resolveWeek(now, TZ, 42)).toMatchObject({ isCurrent: true, weekYear: 2026 });
  });

  it('finds a past week of this year (week 18 = 4/27–5/3)', () => {
    expect(resolveWeek(now, TZ, 18)).toEqual({
      ok: true,
      range: { start: '2026-04-26T16:00:00.000Z', end: '2026-05-03T16:00:00.000Z' },
      weekYear: 2026,
      weekNumber: 18,
      isCurrent: false,
      isThisYear: true,
    });
  });

  it('uses week 1 of the ISO week-year even when it starts in December', () => {
    expect(resolveWeek(now, TZ, 1)).toMatchObject({
      ok: true,
      range: { start: '2025-12-28T16:00:00.000Z' }, // Mon 2025-12-29 Taipei
    });
  });

  it('falls back to last year for a week that has not started yet', () => {
    expect(resolveWeek(now, TZ, 45)).toMatchObject({
      ok: true,
      weekYear: 2025,
      weekNumber: 45,
      isCurrent: false,
      isThisYear: false,
      range: { start: '2025-11-02T16:00:00.000Z' }, // Mon 2025-11-03
    });
  });

  it('reports a week that does not exist in the resolved year', () => {
    // 2025 has 52 ISO weeks; week 53 has not started in 2026, so it resolves to 2025.
    expect(resolveWeek(now, TZ, 53)).toEqual({
      ok: false,
      reason: 'no_such_week',
      weekYear: 2025,
      weekNumber: 53,
    });
  });

  it('accepts week 53 in a 53-week year', () => {
    const lateDecember = at('2026-12-30T12:00:00+08:00'); // ISO 2026-W53
    expect(resolveWeek(lateDecember, TZ)).toMatchObject({
      ok: true,
      weekYear: 2026,
      weekNumber: 53,
      isCurrent: true,
    });
  });

  it('in early January, looks up last year for later weeks', () => {
    const jan = at('2027-01-06T12:00:00+08:00'); // ISO 2027-W01
    expect(resolveWeek(jan, TZ, 52)).toMatchObject({ ok: true, weekYear: 2026, isThisYear: false });
  });
});

describe('resolveMonth', () => {
  const now = at('2026-10-13T12:00:00+08:00');

  it('defaults to the current month', () => {
    expect(resolveMonth(now, TZ)).toEqual({
      range: { start: '2026-09-30T16:00:00.000Z', end: '2026-10-31T16:00:00.000Z' },
      year: 2026,
      month: 10,
      isCurrent: true,
      isThisYear: true,
    });
  });

  it('finds a past month of this year', () => {
    expect(resolveMonth(now, TZ, 9)).toMatchObject({
      year: 2026,
      month: 9,
      isCurrent: false,
      isThisYear: true,
      range: { start: '2026-08-31T16:00:00.000Z', end: '2026-09-30T16:00:00.000Z' },
    });
  });

  it('falls back to last year for a month that has not started', () => {
    expect(resolveMonth(now, TZ, 12)).toMatchObject({ year: 2025, isThisYear: false });
    const jan = at('2027-01-03T12:00:00+08:00');
    expect(resolveMonth(jan, TZ, 12)).toMatchObject({
      year: 2026,
      range: { start: '2026-11-30T16:00:00.000Z', end: '2026-12-31T16:00:00.000Z' },
    });
  });

  it('rejects out-of-range months', () => {
    expect(() => resolveMonth(now, TZ, 0)).toThrow(RangeError);
    expect(() => resolveMonth(now, TZ, 13)).toThrow(RangeError);
  });
});
