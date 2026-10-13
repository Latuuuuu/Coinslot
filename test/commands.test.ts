import { beforeEach, describe, expect, it } from 'vitest';
import { runCommand, type CommandContext } from '../src/core/commands.js';
import { Ledger } from '../src/core/ledger.js';
import { openDatabase, SqliteEntryRepository } from '../src/db/repository.js';

const USER = '423456789012345678';
const TZ = 'Asia/Taipei';

let clock: Date;
let ledger: Ledger;
let web: CommandContext;
let discord: CommandContext;

const run = (text: string, ctx = web) => runCommand(text, ctx);

beforeEach(() => {
  clock = new Date('2026-10-13T12:00:00+08:00');
  ledger = new Ledger({
    repository: new SqliteEntryRepository(openDatabase(':memory:')),
    timezone: TZ,
    now: () => clock,
  });
  web = { ledger, userId: USER, source: 'web', undoScope: 'web' };
  discord = { ledger, userId: USER, source: 'text', undoScope: 'discord' };
});

describe('runCommand: logging', () => {
  it('logs plain text with the surface source', async () => {
    expect(await run('午餐 -120')).toEqual({ text: 'Logged 午餐 -$120' });
    expect(await run('+500 薪水')).toEqual({ text: 'Logged 薪水 +$500' });
    expect((await ledger.all(USER)).map((e) => e.source)).toEqual(['web', 'web']);
  });

  it('explains invalid input instead of staying silent', async () => {
    expect((await run('今天好累')).text).toMatch(/No amount found/);
    expect((await run('+0 x')).text).toBe('Amount must be $1–$10,000,000.');
    expect(await ledger.all(USER)).toEqual([]);
  });
});

describe('runCommand: commands', () => {
  beforeEach(async () => {
    clock = new Date('2026-09-05T12:05:00+08:00');
    await run('麥當勞 -119', discord);
    clock = new Date('2026-10-13T12:00:00+08:00');
    await run('午餐 -120');
  });

  it('/today', async () => {
    expect((await run('/today')).text).toBe('Today: 1 entry · Spent -$120\n\n12:00 午餐 -$120');
  });

  it('/week with a number and -a', async () => {
    const { text } = await run('/week 36 -a');
    expect(text.split('\n')[0]).toBe('W36 (8/31–9/6)');
    expect(text).toContain('Sat 9/5 · 1 entry · Spent -$119\n12:05 麥當勞 -$119');
    expect((await run('/week')).text.split('\n')[0]).toBe('This week · W42 (10/12–10/18)');
    expect((await run('/WEEK')).text.split('\n')[0]).toBe('This week · W42 (10/12–10/18)');
  });

  it('/week validation', async () => {
    expect((await run('/week 0')).text).toMatch(/1 to 53/);
    expect((await run('/week 54')).text).toMatch(/1 to 53/);
    expect((await run('/week abc')).text).toMatch(/1 to 53/);
    expect((await run('/week 53')).text).toBe('2025 has no week 53.');
  });

  it('/month with a number and -a, plus validation', async () => {
    const { text } = await run('/month 9 -a');
    expect(text.split('\n')[0]).toBe('Sep 2026');
    expect(text).toContain('12:05 麥當勞 -$119');
    expect((await run('/month')).text.split('\n')[0]).toBe('This month · Oct 2026');
    expect((await run('/month 13')).text).toMatch(/1 to 12/);
  });

  it('/undo only undoes entries from the same surface', async () => {
    expect(await run('/undo')).toEqual({ text: 'Undid 午餐 -$120' });
    expect(await run('/undo')).toEqual({ text: 'Nothing to undo.' });
    expect(await run('/undo', discord)).toEqual({ text: 'Undid 麥當勞 -$119' });
  });

  it('/export returns an attachment descriptor', async () => {
    expect(await run('/export')).toEqual({
      text: '2 entries',
      attachment: { kind: 'csv', fileName: 'coinslot-20261013.csv' },
    });
  });

  it('/help and unknown commands', async () => {
    expect((await run('/help')).text).toContain('`/week [n] [-a]`');
    expect((await run('/nope')).text).toBe('Unknown command `/nope`. Try `/help`.');
  });
});

describe('runCommand: empty data', () => {
  it('/export with nothing', async () => {
    expect(await run('/export')).toEqual({ text: 'Nothing to export.' });
  });
});
