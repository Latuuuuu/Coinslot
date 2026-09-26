import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dayRange, localDate, previousWeekRange, toUtcIso, weekRange } from '../src/core/period.js';

const TZ = 'Asia/Taipei';
const at = (iso: string) => new Date(iso);

// Run under a non-Taipei process zone to prove nothing depends on the container TZ.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('toUtcIso', () => {
  it('always emits UTC with milliseconds', () => {
    expect(toUtcIso(at('2026-09-26T08:00:00+08:00'))).toBe('2026-09-26T00:00:00.000Z');
  });
});

describe('dayRange', () => {
  it('maps a Taipei day to UTC 16:00 of the previous day', () => {
    expect(dayRange(at('2026-09-26T12:00:00+08:00'), TZ)).toEqual({
      start: '2026-09-25T16:00:00.000Z',
      end: '2026-09-26T16:00:00.000Z',
    });
  });

  it('treats 00:00 Taipei as the start of the new day', () => {
    expect(dayRange(at('2026-09-26T00:00:00+08:00'), TZ).start).toBe('2026-09-25T16:00:00.000Z');
  });

  it('keeps 23:59 Taipei in the same day even though UTC has the same date', () => {
    const range = dayRange(at('2026-09-26T23:59:59+08:00'), TZ);
    expect(range.start).toBe('2026-09-25T16:00:00.000Z');
  });

  it('assigns an early-morning purchase (UTC previous day) to the Taipei day', () => {
    // 01:30 Taipei on the 27th is 17:30 UTC on the 26th.
    const range = dayRange(at('2026-09-26T17:30:00Z'), TZ);
    expect(range).toEqual({
      start: '2026-09-26T16:00:00.000Z',
      end: '2026-09-27T16:00:00.000Z',
    });
  });
});

describe('weekRange', () => {
  // 2026-09-28 is a Monday.
  const thisWeek = { start: '2026-09-27T16:00:00.000Z', end: '2026-10-04T16:00:00.000Z' };

  it('starts on Monday 00:00 Taipei', () => {
    expect(weekRange(at('2026-09-30T12:00:00+08:00'), TZ)).toEqual(thisWeek);
  });

  it('treats Monday 00:30 Taipei (Sunday 16:30 UTC) as the new week', () => {
    expect(weekRange(at('2026-09-27T16:30:00Z'), TZ)).toEqual(thisWeek);
  });

  it('keeps late Sunday night in the current week', () => {
    expect(weekRange(at('2026-10-04T23:59:00+08:00'), TZ)).toEqual(thisWeek);
  });

  it('crosses month boundaries', () => {
    expect(weekRange(at('2026-10-01T09:00:00+08:00'), TZ)).toEqual(thisWeek);
  });
});

describe('previousWeekRange', () => {
  it('returns the full week before the current one', () => {
    expect(previousWeekRange(at('2026-09-27T21:00:00+08:00'), TZ)).toEqual({
      start: '2026-09-13T16:00:00.000Z',
      end: '2026-09-20T16:00:00.000Z',
    });
  });

  it('is adjacent to the current week', () => {
    const now = at('2026-09-28T10:00:00+08:00');
    expect(previousWeekRange(now, TZ).end).toBe(weekRange(now, TZ).start);
  });
});

describe('localDate', () => {
  it('returns the Taipei calendar date', () => {
    expect(localDate(at('2026-09-26T17:30:00Z'), TZ)).toBe('2026-09-27');
    expect(localDate(at('2026-09-26T15:59:59Z'), TZ)).toBe('2026-09-26');
  });
});

describe('invalid zone', () => {
  it('throws', () => {
    expect(() => dayRange(new Date(), 'Mars/Base')).toThrow(/Invalid time zone/);
  });
});
