import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, SqliteEntryRepository, type NewEntry } from '../src/db/repository.js';

const USER = '423456789012345678';
const OTHER = '999999999999999999';

function entry(overrides: Partial<NewEntry> = {}): NewEntry {
  return {
    userId: USER,
    amount: -120,
    note: '午餐',
    source: 'text',
    createdAt: '2026-09-26T04:00:00.000Z',
    ...overrides,
  };
}

let db: Database.Database;
let repo: SqliteEntryRepository;

beforeEach(() => {
  db = openDatabase(':memory:');
  repo = new SqliteEntryRepository(db);
});

describe('SqliteEntryRepository', () => {
  it('inserts and returns the stored entry with an id', async () => {
    const saved = await repo.insert(entry());
    expect(saved).toEqual({ id: 1, ...entry() });
    expect(await repo.listAll(USER)).toEqual([saved]);
  });

  it('stores signed amounts and rejects zero at the database level', async () => {
    await repo.insert(entry({ amount: 500, note: 'income' }));
    expect((await repo.listAll(USER)).map((e) => e.amount)).toEqual([500]);
    await expect(repo.insert(entry({ amount: 0 }))).rejects.toThrow(/CHECK/);
  });

  it('finds the latest active entry, skipping soft-deleted ones', async () => {
    const a = await repo.insert(entry({ createdAt: '2026-09-26T01:00:00.000Z' }));
    const b = await repo.insert(entry({ createdAt: '2026-09-26T02:00:00.000Z' }));
    expect(await repo.findLastActive(USER)).toEqual(b);

    expect(await repo.softDelete(b.id, '2026-09-26T03:00:00.000Z')).toBe(true);
    expect(await repo.findLastActive(USER)).toEqual(a);
    expect(await repo.softDelete(b.id, '2026-09-26T03:00:00.000Z')).toBe(false);

    const row = db.prepare('SELECT deleted_at FROM entries WHERE id = ?').get(b.id);
    expect(row).toEqual({ deleted_at: '2026-09-26T03:00:00.000Z' });
  });

  it('breaks created_at ties by id', async () => {
    await repo.insert(entry({ note: 'first' }));
    const second = await repo.insert(entry({ note: 'second' }));
    expect(await repo.findLastActive(USER)).toEqual(second);
  });

  it('lists a half-open range and excludes other users and deleted rows', async () => {
    await repo.insert(entry({ createdAt: '2026-09-25T15:59:59.999Z', note: 'before' }));
    const inStart = await repo.insert(entry({ createdAt: '2026-09-25T16:00:00.000Z' }));
    const deleted = await repo.insert(entry({ createdAt: '2026-09-26T00:00:00.000Z' }));
    await repo.softDelete(deleted.id, '2026-09-26T01:00:00.000Z');
    await repo.insert(entry({ userId: OTHER, createdAt: '2026-09-26T00:00:00.000Z' }));
    await repo.insert(entry({ createdAt: '2026-09-26T16:00:00.000Z', note: 'end (excluded)' }));

    const listed = await repo.listBetween(
      USER,
      '2026-09-25T16:00:00.000Z',
      '2026-09-26T16:00:00.000Z',
    );
    expect(listed).toEqual([inStart]);
  });

  it('returns null when there is nothing to undo', async () => {
    expect(await repo.findLastActive(USER)).toBeNull();
  });
});
