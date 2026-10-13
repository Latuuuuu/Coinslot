import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { Ledger } from '../src/core/ledger.js';
import { MIGRATIONS, migrate } from '../src/db/migrations.js';
import { openDatabase, SqliteChatRepository, SqliteEntryRepository } from '../src/db/repository.js';

const USER = '423456789012345678';
const OTHER = '999999999999999999';
const TZ = 'Asia/Taipei';

let clock: Date;
let db: Database.Database;
let repo: SqliteEntryRepository;
let ledger: Ledger;

const setNow = (iso: string) => (clock = new Date(iso));

beforeEach(() => {
  clock = new Date('2026-10-13T12:00:00+08:00');
  db = openDatabase(':memory:');
  repo = new SqliteEntryRepository(db);
  ledger = new Ledger({ repository: repo, timezone: TZ, now: () => clock });
});

async function log(text: string, source: Parameters<Ledger['log']>[2], at?: string) {
  if (at) setNow(at);
  const r = await ledger.log(USER, text, source);
  if (!r.ok) throw new Error(r.reason);
  return r.entry;
}

describe('migration 003_web', () => {
  it('keeps existing entries and adds updated_at and chat_messages', () => {
    const legacy = new Database(':memory:');
    // Apply only 001 + 002, insert data, then the rest.
    migrate(legacy, { migrations: MIGRATIONS.slice(0, 2) });
    legacy
      .prepare(
        "INSERT INTO entries (user_id, amount, note, source, created_at) VALUES ('u', -120, '午餐', 'text', 'x')",
      )
      .run();
    expect(migrate(legacy).applied).toEqual(['003_web']);
    expect(legacy.prepare('SELECT amount, note, updated_at FROM entries').get()).toEqual({
      amount: -120,
      note: '午餐',
      updated_at: null,
    });
    expect(
      legacy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'chat_messages'").get(),
    ).toBeDefined();
    expect(migrate(legacy).applied).toEqual([]);
  });

  it('constrains chat roles', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO chat_messages (user_id, role, content, created_at) VALUES ('u', 'admin', 'x', 'x')",
        )
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe('independent /undo', () => {
  it('web chat and Discord each undo only their own entries', async () => {
    const discordText = await log('-100 Discord 文字', 'text', '2026-10-13T09:00:00+08:00');
    const slash = await log('-200 Discord 指令', 'slash', '2026-10-13T10:00:00+08:00');
    const web1 = await log('-300 網頁 1', 'web', '2026-10-13T11:00:00+08:00');
    const web2 = await log('-400 網頁 2', 'web', '2026-10-13T11:30:00+08:00');

    expect(await ledger.undo(USER, 'web')).toEqual(web2);
    expect(await ledger.undo(USER, 'discord')).toEqual(slash);
    expect(await ledger.undo(USER, 'web')).toEqual(web1);
    expect(await ledger.undo(USER, 'web')).toBeNull();
    expect(await ledger.undo(USER)).toEqual(discordText); // default scope is Discord
    expect(await ledger.undo(USER)).toBeNull();
  });

  it('never undoes calendar entries', async () => {
    await log('-500 補記', 'calendar', '2026-10-13T12:00:00+08:00');
    expect(await ledger.undo(USER, 'web')).toBeNull();
    expect(await ledger.undo(USER, 'discord')).toBeNull();
    expect((await ledger.all(USER)).map((e) => e.note)).toEqual(['補記']);
  });

  it('picks the latest by created time, so a back-dated entry is not "last"', async () => {
    const recent = await log('-100 剛剛', 'web', '2026-10-13T12:00:00+08:00');
    await ledger.log(USER, '-50 補昨天', 'web', '2026-10-12T04:00:00.000Z');
    expect(await ledger.undo(USER, 'web')).toEqual(recent);
  });
});

describe('Ledger.log with a timestamp', () => {
  it('back-dates an entry', async () => {
    const r = await ledger.log(USER, '午餐 -120', 'calendar', '2026-10-01T04:00:00.000Z');
    expect(r).toMatchObject({ ok: true, entry: { createdAt: '2026-10-01T04:00:00.000Z' } });
  });
});

describe('Ledger.edit / remove / entry / day', () => {
  it('edits amount, note and time, and records updatedAt', async () => {
    const e = await log('-120 午餐', 'text', '2026-10-13T12:00:00+08:00');
    setNow('2026-10-13T13:00:00+08:00');
    const r = await ledger.edit(USER, e.id, {
      amount: -150,
      note: '  午餐   加蛋 ',
      createdAt: '2026-10-12T04:30:00+08:00',
    });
    expect(r).toEqual({
      ok: true,
      entry: {
        ...e,
        amount: -150,
        note: '午餐 加蛋',
        createdAt: '2026-10-11T20:30:00.000Z',
        updatedAt: '2026-10-13T05:00:00.000Z',
      },
    });
  });

  it('can turn an expense into income and keeps unspecified fields', async () => {
    const e = await log('-120 退款', 'web');
    expect(await ledger.edit(USER, e.id, { amount: 120 })).toMatchObject({
      ok: true,
      entry: { amount: 120, note: '退款', createdAt: e.createdAt },
    });
  });

  it('rejects invalid amounts and times', async () => {
    const e = await log('-120 午餐', 'web');
    for (const amount of [0, 1.5, 10_000_001, -10_000_001]) {
      expect(await ledger.edit(USER, e.id, { amount })).toEqual({
        ok: false,
        reason: 'invalid_amount',
      });
    }
    expect(await ledger.edit(USER, e.id, { createdAt: 'yesterday' })).toEqual({
      ok: false,
      reason: 'invalid_time',
    });
  });

  it("does not touch other users' or deleted entries", async () => {
    const e = await log('-120 午餐', 'web');
    expect(await ledger.edit(OTHER, e.id, { amount: -1 })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await ledger.remove(OTHER, e.id)).toBeNull();
    expect(await ledger.remove(USER, e.id)).toEqual(e);
    expect(await ledger.remove(USER, e.id)).toBeNull();
    expect(await ledger.edit(USER, e.id, { amount: -1 })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await ledger.entry(USER, e.id)).toBeNull();
  });

  it('lists a specific Taipei day', async () => {
    await log('-60 宵夜', 'text', '2026-10-12T23:50:00+08:00');
    await log('-70 早餐', 'text', '2026-10-13T00:10:00+08:00');
    const day = await ledger.day(USER, '2026-10-13');
    expect(day?.entries.map((e) => e.note)).toEqual(['早餐']);
    expect(day?.totals.spent).toBe(-70);
    expect(await ledger.day(USER, '2026-13-40')).toBeNull();
    expect(await ledger.day(USER, 'today')).toBeNull();
  });
});

describe('SqliteChatRepository', () => {
  it('pages history newest-first, returned oldest-first', async () => {
    const chat = new SqliteChatRepository(db);
    for (let i = 1; i <= 5; i++) {
      await chat.append({
        userId: USER,
        role: i % 2 ? 'user' : 'bot',
        content: `m${i}`,
        attachment: null,
        createdAt: `2026-10-13T00:00:0${i}.000Z`,
      });
    }
    await chat.append({
      userId: OTHER,
      role: 'user',
      content: 'other',
      attachment: null,
      createdAt: 'x',
    });

    const latest = await chat.listBefore(USER, null, 2);
    expect(latest.map((m) => m.content)).toEqual(['m4', 'm5']);
    const older = await chat.listBefore(USER, latest[0]!.id, 10);
    expect(older.map((m) => m.content)).toEqual(['m1', 'm2', 'm3']);
    expect(await chat.listBefore(USER, older[0]!.id, 10)).toEqual([]);
  });
});
