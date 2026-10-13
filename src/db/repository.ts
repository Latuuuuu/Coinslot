import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { migrate, type MigrateResult } from './migrations.js';

/**
 * Where an entry was created. Discord: 'text' (channel/DM message) and 'slash' (/log).
 * Web: 'web' (web chat) and 'calendar' (added from the calendar page).
 */
export type EntrySource = 'text' | 'slash' | 'web' | 'calendar';

export interface Entry {
  id: number;
  userId: string;
  /** Signed NTD: expense < 0, income > 0. Never 0. */
  amount: number;
  note: string;
  source: EntrySource;
  /** UTC ISO 8601 */
  createdAt: string;
  /** UTC ISO 8601; set when the entry was edited. */
  updatedAt?: string | null;
}

export interface EntryPatch {
  amount: number;
  note: string;
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
  findById(userId: string, id: number): Promise<Entry | null>;
  /** Most recent active entry created from one of `sources`. */
  findLastActive(userId: string, sources: readonly EntrySource[]): Promise<Entry | null>;
  /** Overwrites amount, note and created_at of an active entry; null if not found. */
  update(userId: string, id: number, patch: EntryPatch, updatedAt: string): Promise<Entry | null>;
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
  updated_at: string | null;
}

const COLUMNS = 'id, user_id, amount, note, source, created_at, updated_at';

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    userId: row.user_id,
    amount: row.amount,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface OpenDatabaseOptions {
  /** Called when migrations ran, e.g. to log them. */
  onMigrated?: (result: MigrateResult) => void;
}

/**
 * Opens the database and applies pending migrations. File databases are
 * snapshotted to <db dir>/backups/ before a migration touches existing data.
 */
export function openDatabase(path: string, options: OpenDatabaseOptions = {}): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const inMemory = path === ':memory:' || path === '';
  const result = migrate(db, inMemory ? {} : { backupDir: join(dirname(path), 'backups') });
  if (result.applied.length > 0) options.onMigrated?.(result);
  return db;
}

export class SqliteEntryRepository implements EntryRepository {
  private readonly insertStmt: Database.Statement<[string, number, string, string, string]>;
  private readonly byIdStmt: Database.Statement<[string, number], EntryRow>;
  private readonly updateStmt: Database.Statement<[number, string, string, string, number, string]>;
  /** One prepared statement per distinct source set (there are only a couple). */
  private readonly lastActiveStmts = new Map<string, Database.Statement<unknown[], EntryRow>>();
  private readonly softDeleteStmt: Database.Statement<[string, number]>;
  private readonly betweenStmt: Database.Statement<[string, string, string], EntryRow>;
  private readonly allStmt: Database.Statement<[string], EntryRow>;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(
      'INSERT INTO entries (user_id, amount, note, source, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    this.byIdStmt = db.prepare(
      `SELECT ${COLUMNS} FROM entries WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
    );
    this.updateStmt = db.prepare(
      `UPDATE entries SET amount = ?, note = ?, created_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
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
    return { id: Number(info.lastInsertRowid), ...entry, updatedAt: null };
  }

  async findById(userId: string, id: number): Promise<Entry | null> {
    const row = this.byIdStmt.get(userId, id);
    return row ? toEntry(row) : null;
  }

  async findLastActive(userId: string, sources: readonly EntrySource[]): Promise<Entry | null> {
    if (sources.length === 0) return null;
    const key = [...sources].sort().join(',');
    let stmt = this.lastActiveStmts.get(key);
    if (!stmt) {
      stmt = this.db.prepare<unknown[], EntryRow>(
        `SELECT ${COLUMNS} FROM entries
         WHERE user_id = ? AND deleted_at IS NULL AND source IN (${sources.map(() => '?').join(', ')})
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      );
      this.lastActiveStmts.set(key, stmt);
    }
    const row = stmt.get(userId, ...[...sources].sort());
    return row ? toEntry(row) : null;
  }

  async update(
    userId: string,
    id: number,
    patch: EntryPatch,
    updatedAt: string,
  ): Promise<Entry | null> {
    const { changes } = this.updateStmt.run(
      patch.amount,
      patch.note,
      patch.createdAt,
      updatedAt,
      id,
      userId,
    );
    return changes > 0 ? this.findById(userId, id) : null;
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

// ---------------------------------------------------------------- web chat history

export type ChatRole = 'user' | 'bot';

export interface ChatMessage {
  id: number;
  userId: string;
  role: ChatRole;
  content: string;
  /** Optional link shown with the message, e.g. a CSV download. */
  attachment: string | null;
  createdAt: string;
}

export type NewChatMessage = Omit<ChatMessage, 'id'>;

export interface ChatRepository {
  append(message: NewChatMessage): Promise<ChatMessage>;
  /** Up to `limit` messages older than `beforeId` (or the newest), returned oldest first. */
  listBefore(userId: string, beforeId: number | null, limit: number): Promise<ChatMessage[]>;
}

interface ChatRow {
  id: number;
  user_id: string;
  role: ChatRole;
  content: string;
  attachment: string | null;
  created_at: string;
}

const toChatMessage = (r: ChatRow): ChatMessage => ({
  id: r.id,
  userId: r.user_id,
  role: r.role,
  content: r.content,
  attachment: r.attachment,
  createdAt: r.created_at,
});

export class SqliteChatRepository implements ChatRepository {
  private readonly insertStmt: Database.Statement<[string, string, string, string | null, string]>;
  private readonly pageStmt: Database.Statement<[string, number, number], ChatRow>;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(
      'INSERT INTO chat_messages (user_id, role, content, attachment, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    this.pageStmt = db.prepare(
      `SELECT id, user_id, role, content, attachment, created_at FROM chat_messages
       WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?`,
    );
  }

  async append(m: NewChatMessage): Promise<ChatMessage> {
    const info = this.insertStmt.run(m.userId, m.role, m.content, m.attachment, m.createdAt);
    return { id: Number(info.lastInsertRowid), ...m };
  }

  async listBefore(userId: string, beforeId: number | null, limit: number): Promise<ChatMessage[]> {
    const rows = this.pageStmt.all(userId, beforeId ?? Number.MAX_SAFE_INTEGER, limit);
    return rows.reverse().map(toChatMessage);
  }
}
