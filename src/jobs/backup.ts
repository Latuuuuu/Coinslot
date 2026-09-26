import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { localDate } from '../core/period.js';

export const BACKUP_KEEP = 14;
const BACKUP_FILE = /^coinslot-\d{4}-\d{2}-\d{2}\.db$/;

export function backupFileName(now: Date, tz: string): string {
  return `coinslot-${localDate(now, tz)}.db`;
}

/** Given the files in the backup directory, return the old backups to delete. */
export function selectBackupsToPrune(files: string[], keep = BACKUP_KEEP): string[] {
  // Names embed YYYY-MM-DD, so lexical order is chronological.
  return files
    .filter((f) => BACKUP_FILE.test(f))
    .sort()
    .reverse()
    .slice(keep);
}

/** Online backup via SQLite's backup API (safe while the bot is writing). */
export async function backupDatabase(
  db: Database.Database,
  dir: string,
  now: Date,
  tz: string,
  keep = BACKUP_KEEP,
): Promise<{ file: string; pruned: string[] }> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, backupFileName(now, tz));
  await db.backup(file);
  const pruned = selectBackupsToPrune(await readdir(dir), keep);
  await Promise.all(pruned.map((f) => rm(join(dir, f), { force: true })));
  return { file, pruned };
}
