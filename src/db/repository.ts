import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';

export type EntrySource = 'text' | 'slash';

export interface Entry {
  id: number;
  userId: string;
  amount: number;
  note: string;
  source: EntrySource;
  /** UTC ISO 8601 */
  createdAt: string;
}

export interface NewEntry {
  userId: string;
  amount: number;
  note: string;
  source: EntrySource;
  createdAt: string;
}

/**
 * Storage boundary for entries. Async so a D1 (or other remote) implementation can
 * drop in later. All reads exclude soft-deleted rows and return oldest first.
 */
export interface EntryRepository {
  insert(entry: NewEntry): Promise<Entry>;
  findLastActive(userId: string): Promise<Entry | null>;
  /** Returns true if an active row was marked deleted. */
  softDelete(id: number, deletedAt: string): Promise<boolean>;
  /** Entries with start <= created_at < end. */
  listBetween(userId: string, start: string, end: string): Promise<Entry[]>;
  listAll(userId: string): Promise<Entry[]>;
}

interface EntryRow {
  id: number;
  user_id: string;
  amount: number;
  note: string;
  source: EntrySource;
  created_at: string;
}

const COLUMNS = 'id, user_id, amount, note, source, created_at';

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
  };
}

const SCHEMA_URL = new URL('./schema.sql', import.meta.url);

export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(SCHEMA_URL, 'utf8'));
  return db;
}

export class SqliteEntryRepository implements EntryRepository {
  private readonly insertStmt: Database.Statement<[string, number, string, string, string]>;
  private readonly lastActiveStmt: Database.Statement<[string], EntryRow>;
  private readonly softDeleteStmt: Database.Statement<[string, number]>;
  private readonly betweenStmt: Database.Statement<[string, string, string], EntryRow>;
  private readonly allStmt: Database.Statement<[string], EntryRow>;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(
      'INSERT INTO entries (user_id, amount, note, source, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    this.lastActiveStmt = db.prepare(
      `SELECT ${COLUMNS} FROM entries
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    this.softDeleteStmt = db.prepare(
      'UPDATE entries SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL',
    );
    this.betweenStmt = db.prepare(
      `SELECT ${COLUMNS} FROM entries
       WHERE user_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?
       ORDER BY created_at, id`,
    );
    this.allStmt = db.prepare(
      `SELECT ${COLUMNS} FROM entries
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY created_at, id`,
    );
  }

  async insert(entry: NewEntry): Promise<Entry> {
    const info = this.insertStmt.run(
      entry.userId,
      entry.amount,
      entry.note,
      entry.source,
      entry.createdAt,
    );
    return { id: Number(info.lastInsertRowid), ...entry };
  }

  async findLastActive(userId: string): Promise<Entry | null> {
    const row = this.lastActiveStmt.get(userId);
    return row ? toEntry(row) : null;
  }

  async softDelete(id: number, deletedAt: string): Promise<boolean> {
    return this.softDeleteStmt.run(deletedAt, id).changes > 0;
  }

  async listBetween(userId: string, start: string, end: string): Promise<Entry[]> {
    return this.betweenStmt.all(userId, start, end).map(toEntry);
  }

  async listAll(userId: string): Promise<Entry[]> {
    return this.allStmt.all(userId).map(toEntry);
  }
}
