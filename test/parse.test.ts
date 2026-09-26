import { describe, expect, it } from 'vitest';
import { parseEntry } from '../src/core/parse.js';

describe('parseEntry', () => {
  it.each([
    ['-120 午餐', 120, '午餐'],
    ['午餐 -120', 120, '午餐'],
    ['-1,200 耳機', 1200, '耳機'],
    ['-85 飲料', 85, '飲料'],
    ['-120元 早餐', 120, '早餐'],
    ['-１２０ 午餐', 120, '午餐'],
  ])('parses HANDOFF example %j', (input, amount, note) => {
    expect(parseEntry(input)).toEqual({ ok: true, amount, note });
  });

  it.each([
    ['120 午餐', 120, '午餐'],
    ['午餐 120', 120, '午餐'],
    ['午餐 120元', 120, '午餐'],
  ])('accepts amounts without a minus sign: %j', (input, amount, note) => {
    expect(parseEntry(input)).toEqual({ ok: true, amount, note });
  });

  it('handles full-width minus, comma and spaces', () => {
    expect(parseEntry('－１，２００　耳機')).toEqual({ ok: true, amount: 1200, note: '耳機' });
    expect(parseEntry('−120 午餐')).toEqual({ ok: true, amount: 120, note: '午餐' });
  });

  it('collapses extra whitespace and keeps multi-word notes', () => {
    expect(parseEntry('  -120   午餐   便當  ')).toEqual({
      ok: true,
      amount: 120,
      note: '午餐 便當',
    });
  });

  it('keeps digits inside the note', () => {
    expect(parseEntry('-50 7-11 咖啡')).toEqual({ ok: true, amount: 50, note: '7-11 咖啡' });
    expect(parseEntry('2 杯咖啡 -130')).toEqual({ ok: true, amount: 130, note: '2 杯咖啡' });
  });

  it('prefers the first token when both ends are unsigned amounts', () => {
    expect(parseEntry('120 午餐 2')).toEqual({ ok: true, amount: 120, note: '午餐 2' });
  });

  it('allows an amount without a note', () => {
    expect(parseEntry('-120')).toEqual({ ok: true, amount: 120, note: '' });
  });

  it('rejects empty input', () => {
    expect(parseEntry('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseEntry('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects text without an amount at either end', () => {
    expect(parseEntry('今天好累')).toEqual({ ok: false, reason: 'no_amount' });
    expect(parseEntry('午餐 吃了 -120 元')).toEqual({ ok: false, reason: 'no_amount' });
    expect(parseEntry('-12.5 咖啡')).toEqual({ ok: false, reason: 'no_amount' });
    expect(parseEntry('-1,20 午餐')).toEqual({ ok: false, reason: 'no_amount' });
    expect(parseEntry('-1200,0 午餐')).toEqual({ ok: false, reason: 'no_amount' });
  });

  it('rejects zero, income and oversized amounts', () => {
    expect(parseEntry('-0 午餐')).toEqual({ ok: false, reason: 'invalid_amount' });
    expect(parseEntry('+500 薪水')).toEqual({ ok: false, reason: 'invalid_amount' });
    expect(parseEntry('-10,000,000 車')).toEqual({ ok: true, amount: 10_000_000, note: '車' });
    expect(parseEntry('-10,000,001 車')).toEqual({ ok: false, reason: 'invalid_amount' });
  });
});
