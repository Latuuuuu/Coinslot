import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '../src/db/migrations.js';
import { openDatabase, SqliteEntryRepository } from '../src/db/repository.js';

// Exactly what the pre-migration schema.sql created (no schema_migrations table).
const LEGACY_SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  note        TEXT    NOT NULL DEFAULT '',
  category    TEXT,
  source      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_user_created ON entries (user_id, created_at);
`;

const NOW = new Date('2026-09-27T01:00:00.000Z');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coinslot-migrate-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function legacyDb(path: string): Database.Database {
  const db = new Database(path);
  db.exec(LEGACY_SCHEMA);
  const insert = db.prepare(
    'INSERT INTO entries (user_id, amount, note, source, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  insert.run('u', 119, '麥當勞', 'text', '2026-09-26T15:21:00.000Z', null);
  insert.run('u', 162, '肯德基', 'slash', '2026-09-26T15:22:00.000Z', null);
  insert.run('u', 50, '誤記', 'text', '2026-09-26T15:23:00.000Z', '2026-09-26T15:24:00.000Z');
  return db;
}

type Row = { id: number; amount: number; note: string; source: string; deleted_at: string | null };
const rows = (db: Database.Database) =>
  db.prepare('SELECT id, amount, note, source, deleted_at FROM entries ORDER BY id').all() as Row[];

describe('migrate: legacy positive amounts', () => {
  it('negates amounts and keeps every other column, including soft deletes', () => {
    const db = legacyDb(join(dir, 'coinslot.db'));
    const result = migrate(db, { now: NOW });

    expect(result.applied).toEqual(['001_initial', '002_signed_amounts']);
    expect(rows(db)).toEqual([
      { id: 1, amount: -119, note: '麥當勞', source: 'text', deleted_at: null },
      { id: 2, amount: -162, note: '肯德基', source: 'slash', deleted_at: null },
      { id: 3, amount: -50, note: '誤記', source: 'text', deleted_at: '2026-09-26T15:24:00.000Z' },
    ]);
  });

  it('is safe to run again: nothing is applied and amounts are not flipped back', () => {
    const db = legacyDb(join(dir, 'coinslot.db'));
    migrate(db, { now: NOW });
    const before = rows(db);

    expect(migrate(db, { now: NOW })).toEqual({ applied: [], backupFile: null });
    expect(migrate(db, { now: NOW }).applied).toEqual([]);
    expect(rows(db)).toEqual(before);
  });

  it('replaces the CHECK constraint: negatives and income allowed, zero rejected', () => {
    const db = legacyDb(join(dir, 'coinslot.db'));
    migrate(db, { now: NOW });
    const insert = db.prepare(
      "INSERT INTO entries (user_id, amount, source, created_at) VALUES ('u', ?, 'text', 'x')",
    );
    expect(() => insert.run(-1)).not.toThrow();
    expect(() => insert.run(500)).not.toThrow();
    expect(() => insert.run(0)).toThrow(/CHECK/);
  });

  it('keeps the index and continues ids after the existing rows', async () => {
    const db = legacyDb(join(dir, 'coinslot.db'));
    migrate(db, { now: NOW });
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entries'")
      .pluck()
      .all();
    expect(indexes).toContain('idx_entries_user_created');

    const saved = await new SqliteEntryRepository(db).insert({
      userId: 'u',
      amount: -10,
      note: 'next',
      source: 'text',
      createdAt: '2026-09-27T00:00:00.000Z',
    });
    expect(saved.id).toBe(4);
  });

  it('snapshots the database before migrating existing data', () => {
    const db = legacyDb(join(dir, 'coinslot.db'));
    const backupDir = join(dir, 'backups');
    const { backupFile } = migrate(db, { backupDir, now: NOW });

    expect(backupFile).toBe(join(backupDir, 'pre-migration-2026-09-27T01-00-00-000Z.db'));
    expect(existsSync(backupFile!)).toBe(true);
    // The snapshot holds the original, untouched data.
    const snapshot = new Database(backupFile!, { readonly: true });
    expect(rows(snapshot).map((r) => r.amount)).toEqual([119, 162, 50]);
    snapshot.close();

    // No second snapshot when there is nothing left to apply.
    expect(migrate(db, { backupDir, now: new Date() }).backupFile).toBeNull();
    expect(readdirSync(backupDir)).toHaveLength(1);
  });

  it('rolls back a failing migration and leaves it pending', () => {
    const db = legacyDb(join(dir, 'coinslot.db'));
    const broken = [...MIGRATIONS, { id: '999_broken', sql: 'UPDATE entries SET amount = 0;' }];
    expect(() => migrate(db, { now: NOW, migrations: broken })).toThrow(/CHECK/);
    expect(rows(db).map((r) => r.amount)).toEqual([-119, -162, -50]);
    expect(migrate(db, { now: NOW }).applied).toEqual([]);
  });
});

describe('openDatabase', () => {
  it('creates the signed schema on a fresh database without a backup', () => {
    const path = join(dir, 'fresh.db');
    const db = openDatabase(path);
    const sql = db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'entries'")
      .pluck()
      .get() as string;
    expect(sql).toContain('CHECK (amount != 0)');
    expect(existsSync(join(dir, 'backups'))).toBe(false);
    db.close();
  });

  it('migrates a legacy file on open, backs it up, and reports what ran', () => {
    const path = join(dir, 'coinslot.db');
    legacyDb(path).close();

    const reports: string[][] = [];
    const db = openDatabase(path, { onMigrated: (r) => reports.push(r.applied) });
    expect(reports).toEqual([['001_initial', '002_signed_amounts']]);
    expect(rows(db).map((r) => r.amount)).toEqual([-119, -162, -50]);
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
    db.close();

    // Reopening is a no-op.
    const again = openDatabase(path, { onMigrated: (r) => reports.push(r.applied) });
    expect(reports).toHaveLength(1);
    expect(rows(again).map((r) => r.amount)).toEqual([-119, -162, -50]);
    again.close();
  });
});
