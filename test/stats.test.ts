import { describe, expect, it } from 'vitest';
import { normalizeNote, summarize, topSpending } from '../src/core/stats.js';
import type { Entry } from '../src/db/repository.js';

let nextId = 1;
function entry(amount: number, note: string, createdAt = '2026-09-22T04:00:00.000Z'): Entry {
  return { id: nextId++, userId: 'u', amount, note, source: 'text', createdAt };
}

describe('summarize', () => {
  it('handles expenses only', () => {
    expect(summarize([entry(-119, 'a'), entry(-2264, 'b')])).toEqual({
      count: 2,
      spent: -2383,
      earned: 0,
      net: -2383,
    });
  });

  it('separates expenses and income (income built directly as test data)', () => {
    expect(summarize([entry(-2383, 'a'), entry(500, '薪水')])).toEqual({
      count: 2,
      spent: -2383,
      earned: 500,
      net: -1883,
    });
  });

  it('handles income only and empty input', () => {
    expect(summarize([entry(500, '薪水')])).toEqual({ count: 1, spent: 0, earned: 500, net: 500 });
    expect(summarize([])).toEqual({ count: 0, spent: 0, earned: 0, net: 0 });
  });
});

describe('normalizeNote', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeNote('  麥當勞  ')).toBe('麥當勞');
    expect(normalizeNote('褲架   菜瓜布\t抹布')).toBe('褲架 菜瓜布 抹布');
    expect(normalizeNote('')).toBe('');
    expect(normalizeNote('   ')).toBe('');
  });

  it('does not fuzzy-match', () => {
    expect(normalizeNote('麥當勞')).not.toBe(normalizeNote('麦当劳'));
    expect(normalizeNote('McDonalds')).not.toBe(normalizeNote('mcdonalds'));
  });
});

describe('topSpending', () => {
  it('merges notes that are equal after normalization', () => {
    const groups = topSpending([
      entry(-119, '麥當勞'),
      entry(-119, '  麥當勞 '),
      entry(-233, '褲架 菜瓜布 抹布'),
      entry(-100, '褲架  菜瓜布   抹布'),
    ]);
    expect(groups.map((g) => [g.note, g.total, g.count])).toEqual([
      ['褲架 菜瓜布 抹布', -333, 2],
      ['麥當勞', -238, 2],
    ]);
  });

  it('ignores income entirely', () => {
    const groups = topSpending([entry(-100, '午餐'), entry(50_000, '薪水'), entry(300, '午餐')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ note: '午餐', total: -100, count: 1 });
  });

  it('returns nothing when there is only income', () => {
    expect(topSpending([entry(500, '薪水')])).toEqual([]);
  });

  it('sorts by total spending, keeps the top three', () => {
    const groups = topSpending([
      entry(-119, '麥當勞'),
      entry(-119, '麥當勞'),
      entry(-162, '肯德基'),
      entry(-1750, '修腳踏車'),
      entry(-233, '褲架 菜瓜布 抹布'),
    ]);
    expect(groups.map((g) => [g.note, g.total])).toEqual([
      ['修腳踏車', -1750],
      ['麥當勞', -238],
      ['褲架 菜瓜布 抹布', -233],
    ]);
  });

  it('lists every group when there are fewer than three', () => {
    expect(topSpending([entry(-10, 'a'), entry(-20, 'b')]).map((g) => g.note)).toEqual(['b', 'a']);
  });

  it('breaks equal totals by entry count, then by most recent entry', () => {
    const groups = topSpending(
      [
        entry(-200, 'single-old', '2026-09-21T01:00:00.000Z'),
        entry(-100, 'pair', '2026-09-21T00:00:00.000Z'),
        entry(-100, 'pair', '2026-09-21T00:30:00.000Z'),
        entry(-200, 'single-new', '2026-09-23T01:00:00.000Z'),
      ],
      10,
    );
    expect(groups.map((g) => g.note)).toEqual(['pair', 'single-new', 'single-old']);
  });

  it('tracks the latest entry of each group regardless of input order', () => {
    const [group] = topSpending([
      entry(-1, 'x', '2026-09-23T00:00:00.000Z'),
      entry(-1, 'x', '2026-09-21T00:00:00.000Z'),
    ]);
    expect(group?.lastAt).toBe('2026-09-23T00:00:00.000Z');
  });

  it('groups empty notes together', () => {
    const groups = topSpending([entry(-50, ''), entry(-30, '   '), entry(-10, '咖啡')]);
    expect(groups[0]).toMatchObject({ note: '', total: -80, count: 2 });
  });
});
