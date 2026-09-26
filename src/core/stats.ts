import type { Entry } from '../db/repository.js';

// Pure aggregation over signed amounts (expense < 0, income > 0).

export interface Totals {
  count: number;
  /** Sum of expenses; <= 0. */
  spent: number;
  /** Sum of income; >= 0. */
  earned: number;
  /** spent + earned */
  net: number;
}

export function summarize(entries: readonly Entry[]): Totals {
  let spent = 0;
  let earned = 0;
  for (const e of entries) {
    if (e.amount < 0) spent += e.amount;
    else earned += e.amount;
  }
  return { count: entries.length, spent, earned, net: spent + earned };
}

/** Trim and collapse internal whitespace. Exact match after this defines a group. */
export function normalizeNote(note: string): string {
  return note.trim().replace(/\s+/g, ' ');
}

export interface SpendingGroup {
  /** Normalized note; '' for entries without one. */
  note: string;
  /** Sum of the group's expenses; < 0. */
  total: number;
  count: number;
  /** created_at of the group's most recent entry (UTC ISO). */
  lastAt: string;
}

/**
 * Expenses grouped by normalized note, biggest spending first.
 * Ties: more entries first, then the most recent entry first. Income is ignored.
 */
export function topSpending(entries: readonly Entry[], limit = 3): SpendingGroup[] {
  const groups = new Map<string, SpendingGroup>();
  for (const e of entries) {
    if (e.amount >= 0) continue;
    const note = normalizeNote(e.note);
    const group = groups.get(note);
    if (!group) {
      groups.set(note, { note, total: e.amount, count: 1, lastAt: e.createdAt });
    } else {
      group.total += e.amount;
      group.count += 1;
      if (e.createdAt > group.lastAt) group.lastAt = e.createdAt;
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        a.total - b.total || // more negative = more spending
        b.count - a.count ||
        b.lastAt.localeCompare(a.lastAt) ||
        a.note.localeCompare(b.note), // deterministic final tiebreak
    )
    .slice(0, limit);
}
