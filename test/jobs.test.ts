import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cron } from 'croner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { Ledger } from '../src/core/ledger.js';
import { openDatabase, SqliteEntryRepository } from '../src/db/repository.js';
import type { AppContext } from '../src/discord/context.js';
import { backupDatabase, backupFileName, selectBackupsToPrune } from '../src/jobs/backup.js';
import { sendHeartbeat } from '../src/jobs/heartbeat.js';
import { runReminder } from '../src/jobs/reminder.js';
import { runWeeklyReport } from '../src/jobs/weekly.js';

const TZ = 'Asia/Taipei';
const OWNER = '423456789012345678';

let clock: Date;
let ctx: AppContext;

beforeEach(() => {
  clock = new Date('2026-09-27T22:00:00+08:00');
  ctx = {
    config: { ownerUserId: OWNER, timezone: TZ } as Config,
    ledger: new Ledger({
      repository: new SqliteEntryRepository(openDatabase(':memory:')),
      timezone: TZ,
      now: () => clock,
    }),
  };
});

describe('runReminder', () => {
  it('pings the owner when nothing was logged today', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    expect(await runReminder(ctx, notify)).toBe(true);
    expect(notify).toHaveBeenCalledWith(`<@${OWNER}> Nothing logged today. Spent it? Slot it.`, {
      mentionUserId: OWNER,
    });
  });

  it('stays quiet when there is already an entry today', async () => {
    await ctx.ledger.log(OWNER, '-120 午餐', 'text');
    const notify = vi.fn();
    expect(await runReminder(ctx, notify)).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not count yesterday's late-night entry", async () => {
    clock = new Date('2026-09-26T23:59:00+08:00');
    await ctx.ledger.log(OWNER, '-60 宵夜', 'text');
    clock = new Date('2026-09-27T22:00:00+08:00');
    const notify = vi.fn().mockResolvedValue(undefined);
    expect(await runReminder(ctx, notify)).toBe(true);
  });
});

describe('runWeeklyReport', () => {
  it('posts the formatted report without mentions', async () => {
    await ctx.ledger.log(OWNER, '-1,200 耳機', 'text');
    const notify = vi.fn().mockResolvedValue(undefined);
    await runWeeklyReport(ctx, notify);
    expect(notify).toHaveBeenCalledWith(
      [
        '**Weekly report 9/21–9/27**',
        '1 entry · Spent -$1,200',
        'Last week: no spending',
        '',
        'Top spending',
        '耳機 -$1,200',
      ].join('\n'),
    );
  });
});

describe('cron patterns', () => {
  it('fires the Sunday 21:00 report in Taipei time regardless of process TZ', () => {
    const cron = new Cron('0 21 * * 0', { timezone: TZ, paused: true });
    const next = cron.nextRun(new Date('2026-09-26T00:00:00Z'));
    expect(next?.toISOString()).toBe('2026-09-27T13:00:00.000Z');
    cron.stop();
  });
});

describe('backups', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coinslot-backup-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('names backups by Taipei date', () => {
    expect(backupFileName(new Date('2026-09-26T20:00:00Z'), TZ)).toBe('coinslot-2026-09-27.db');
  });

  it('keeps the newest N and ignores unrelated files', () => {
    const files = [
      'notes.txt',
      ...Array.from(
        { length: 16 },
        (_, i) => `coinslot-2026-09-${String(i + 1).padStart(2, '0')}.db`,
      ),
    ];
    expect(selectBackupsToPrune(files, 14)).toEqual([
      'coinslot-2026-09-02.db',
      'coinslot-2026-09-01.db',
    ]);
    expect(selectBackupsToPrune(files.slice(0, 5), 14)).toEqual([]);
  });

  it('writes a readable backup and prunes old ones', async () => {
    const db = openDatabase(join(dir, 'coinslot.db'));
    const repo = new SqliteEntryRepository(db);
    await repo.insert({
      userId: OWNER,
      amount: -120,
      note: '午餐',
      source: 'text',
      createdAt: '2026-09-27T04:00:00.000Z',
    });
    const backups = join(dir, 'backups');
    await backupDatabase(db, backups, new Date('2026-09-01T12:00:00+08:00'), TZ, 2);
    await backupDatabase(db, backups, new Date('2026-09-02T12:00:00+08:00'), TZ, 2);
    const { file, pruned } = await backupDatabase(
      db,
      backups,
      new Date('2026-09-03T12:00:00+08:00'),
      TZ,
      2,
    );

    expect(pruned).toEqual(['coinslot-2026-09-01.db']);
    expect(readdirSync(backups).sort()).toEqual([
      'coinslot-2026-09-02.db',
      'coinslot-2026-09-03.db',
    ]);
    expect(existsSync(file)).toBe(true);
    const restored = new SqliteEntryRepository(openDatabase(file));
    expect((await restored.listAll(OWNER)).map((e) => e.note)).toEqual(['午餐']);
    db.close();
  });

  it('does not touch non-backup files', async () => {
    const db = openDatabase(':memory:');
    const backups = join(dir, 'backups');
    await backupDatabase(db, backups, new Date(), TZ, 0);
    writeFileSync(join(backups, 'keep-me.txt'), 'x');
    await backupDatabase(db, backups, new Date(), TZ, 0);
    expect(readdirSync(backups)).toEqual(['keep-me.txt']);
  });
});

describe('sendHeartbeat', () => {
  it('calls the push URL and rejects on HTTP errors', async () => {
    const ok = vi.fn().mockResolvedValue(new Response('ok'));
    await sendHeartbeat('https://kuma.example/api/push/abc', ok);
    expect(ok).toHaveBeenCalledWith('https://kuma.example/api/push/abc', expect.any(Object));

    const bad = vi.fn().mockResolvedValue(new Response('no', { status: 404 }));
    await expect(sendHeartbeat('https://kuma.example/x', bad)).rejects.toThrow(/404/);
  });
});
