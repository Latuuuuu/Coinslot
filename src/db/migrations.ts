import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

export interface Migration {
  id: string;
  sql: string;
}

/**
 * Ordered schema history. Never edit an applied migration; append a new one.
 * Plain SQL only (no SQLite extensions) so it stays portable to Cloudflare D1.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    // Original MVP schema: amounts stored as positive expense values.
    id: '001_initial',
    sql: `
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
    `,
  },
  {
    // Signed amounts: expense < 0, income > 0, so SUM(amount) is the net.
    // SQLite cannot alter a CHECK constraint, so the table is rebuilt.
    id: '002_signed_amounts',
    sql: `
      CREATE TABLE entries_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT    NOT NULL,                      -- Discord user ID (snowflake as string)
        amount      INTEGER NOT NULL CHECK (amount != 0),  -- NTD; expense < 0, income > 0
        note        TEXT    NOT NULL DEFAULT '',
        category    TEXT,                                  -- reserved, unused in MVP
        source      TEXT    NOT NULL,                      -- 'text' | 'slash'
        created_at  TEXT    NOT NULL,                      -- UTC ISO 8601
        deleted_at  TEXT                                   -- soft delete
      );
      INSERT INTO entries_new (id, user_id, amount, note, category, source, created_at, deleted_at)
        SELECT id, user_id, -amount, note, category, source, created_at, deleted_at FROM entries;
      DROP TABLE entries;
      ALTER TABLE entries_new RENAME TO entries;
      CREATE INDEX IF NOT EXISTS idx_entries_user_created ON entries (user_id, created_at);
    `,
  },
];

export interface MigrateOptions {
  /** Where to write a snapshot before touching existing data. Omit to skip (e.g. in-memory DBs). */
  backupDir?: string;
  now?: Date;
  migrations?: readonly Migration[];
}

export interface MigrateResult {
  applied: string[];
  backupFile: string | null;
}

function hasTable(db: Database.Database, name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !==
    undefined
  );
}

/**
 * Applies pending migrations, each in its own transaction together with its
 * bookkeeping row, so re-running is always safe.
 */
export function migrate(db: Database.Database, options: MigrateOptions = {}): MigrateResult {
  const { backupDir, now = new Date(), migrations = MIGRATIONS } = options;

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id          TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL
  )`);
  const done = new Set(db.prepare('SELECT id FROM schema_migrations').pluck().all() as string[]);
  const pending = migrations.filter((m) => !done.has(m.id));
  if (pending.length === 0) return { applied: [], backupFile: null };

  // Snapshot only when there is existing data that a migration could damage.
  let backupFile: string | null = null;
  if (backupDir && hasTable(db, 'entries')) {
    mkdirSync(backupDir, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    backupFile = join(backupDir, `pre-migration-${stamp}.db`);
    db.prepare('VACUUM INTO ?').run(backupFile);
  }

  const record = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  const apply = db.transaction((m: Migration) => {
    db.exec(m.sql);
    record.run(m.id, now.toISOString());
  });
  for (const m of pending) apply(m);

  return { applied: pending.map((m) => m.id), backupFile };
}
