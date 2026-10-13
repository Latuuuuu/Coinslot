import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Ledger } from '../src/core/ledger.js';
import { openDatabase, SqliteChatRepository, SqliteEntryRepository } from '../src/db/repository.js';
import { createWebApp, CSRF_HEADER } from '../src/web/app.js';

const USER = '423456789012345678';
const TZ = 'Asia/Taipei';

let clock: Date;
let ledger: Ledger;
let app: Hono;

function build(options: { allowedUsers?: string[]; staticDir?: string } = {}) {
  const db = openDatabase(':memory:');
  ledger = new Ledger({
    repository: new SqliteEntryRepository(db),
    timezone: TZ,
    now: () => clock,
  });
  app = createWebApp({ ledger, chat: new SqliteChatRepository(db), userId: USER, ...options });
}

beforeEach(() => {
  clock = new Date('2026-10-13T12:00:00+08:00');
  build();
});

// Tests read arbitrary JSON shapes; keep them loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestResponse = Omit<Response, 'json'> & { json(): Promise<any> };

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(path, { headers }) as Promise<TestResponse>;
const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', [CSRF_HEADER]: '1', ...headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  }) as Promise<TestResponse>;

async function logAt(iso: string, text: string, source: 'text' | 'web' = 'text') {
  clock = new Date(iso);
  const r = await ledger.log(USER, text, source);
  if (!r.ok) throw new Error(r.reason);
  clock = new Date('2026-10-13T12:00:00+08:00');
  return r.entry;
}

describe('guards', () => {
  it('requires the CSRF header on writes but not on reads', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '午餐 -120' }),
    });
    expect(res.status).toBe(403);
    expect(await ledger.all(USER)).toEqual([]);
    expect((await get('/api/health')).status).toBe(200);
  });

  it('enforces the Tailscale allow-list when configured', async () => {
    build({ allowedUsers: ['Me@Example.com'] });
    expect((await get('/api/health')).status).toBe(403);
    expect((await get('/api/health', { 'tailscale-user-login': 'other@example.com' })).status).toBe(
      403,
    );
    expect((await get('/api/health', { 'tailscale-user-login': 'me@example.com' })).status).toBe(
      200,
    );
  });

  it('sets security headers and disables caching on the API', async () => {
    const res = await get('/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns JSON 404 for unknown API paths', async () => {
    const res = await get('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });
});

describe('GET /api/calendar', () => {
  it('returns per-day totals for the month, today and the month summary', async () => {
    await logAt('2026-10-01T00:10:00+08:00', '-70 早餐');
    await logAt('2026-10-13T08:00:00+08:00', '-65 咖啡');
    await logAt('2026-10-13T09:00:00+08:00', '+500 發票');
    await logAt('2026-09-30T23:50:00+08:00', '-60 九月');

    const body = await (await get('/api/calendar?month=2026-10')).json();
    expect(body).toMatchObject({
      month: '2026-10',
      label: 'Oct 2026',
      today: '2026-10-13',
      totals: { count: 3, spent: -135, earned: 500, net: 365 },
    });
    expect(body.days).toEqual([
      { date: '2026-10-01', totals: { count: 1, spent: -70, earned: 0, net: -70 } },
      { date: '2026-10-13', totals: { count: 2, spent: -65, earned: 500, net: 435 } },
    ]);
    expect(body.topSpending.map((g: { note: string }) => g.note)).toEqual(['早餐', '咖啡']);
  });

  it('defaults to the current month and validates the parameter', async () => {
    expect((await (await get('/api/calendar')).json()).month).toBe('2026-10');
    expect((await get('/api/calendar?month=2026-13')).status).toBe(400);
    expect((await get('/api/calendar?month=oct')).status).toBe(400);
  });
});

describe('GET /api/day/:date', () => {
  it('lists the entries of a Taipei day with local date and time', async () => {
    await logAt('2026-10-12T23:50:00+08:00', '-60 宵夜');
    const e = await logAt('2026-10-13T00:10:00+08:00', '-70 早餐');
    const body = await (await get('/api/day/2026-10-13')).json();
    expect(body.totals.spent).toBe(-70);
    expect(body.entries).toEqual([{ ...e, date: '2026-10-13', time: '00:10' }]);
    expect((await get('/api/day/2026-02-30')).status).toBe(400);
  });
});

describe('GET /api/period', () => {
  beforeEach(async () => {
    await logAt('2026-09-05T12:05:00+08:00', '麥當勞 -119');
    await logAt('2026-09-05T18:40:00+08:00', '麥當勞 -119');
  });

  it('returns a week with title, totals and days', async () => {
    const body = await (await get('/api/period?type=week&n=36')).json();
    expect(body).toMatchObject({
      type: 'week',
      weekNumber: 36,
      weekYear: 2026,
      isCurrent: false,
      title: 'W36 (8/31–9/6)',
      totals: { count: 2, spent: -238 },
      topSpending: [{ note: '麥當勞', total: -238, count: 2 }],
    });
    expect(body.days).toHaveLength(1);
    expect(body.days[0].entries.map((e: { time: string }) => e.time)).toEqual(['12:05', '18:40']);
    expect((await (await get('/api/period?type=week')).json()).title).toBe(
      'This week · W42 (10/12–10/18)',
    );
  });

  it('returns a month, current or past', async () => {
    expect((await (await get('/api/period?type=month&n=9')).json()).title).toBe('Sep 2026');
    expect((await (await get('/api/period?type=month')).json()).title).toBe(
      'This month · Oct 2026',
    );
  });

  it('accepts an explicit year for calendar browsing', async () => {
    const w42 = await (await get('/api/period?type=week&n=42&year=2025')).json();
    expect(w42).toMatchObject({
      weekYear: 2025,
      isCurrent: false,
      title: 'W42 2025 (10/13–10/19)',
    });
    const oct = await (await get('/api/period?type=month&n=10&year=2025')).json();
    expect(oct).toMatchObject({ year: 2025, title: 'Oct 2025' });
    expect((await get('/api/period?type=week&year=2025')).status).toBe(400);
    expect((await get('/api/period?type=week&n=1&year=1999')).status).toBe(400);
    expect((await get('/api/period?type=week&n=53&year=2025')).status).toBe(404);
  });

  it('validates type and n', async () => {
    expect((await get('/api/period?type=year')).status).toBe(400);
    expect((await get('/api/period?type=week&n=54')).status).toBe(400);
    expect((await get('/api/period?type=week&n=1.5')).status).toBe(400);
    expect((await get('/api/period?type=month&n=0')).status).toBe(400);
    const missing = await get('/api/period?type=week&n=53');
    expect(missing.status).toBe(404);
    expect((await missing.json()).message).toBe('2025 has no week 53.');
  });
});

describe('entries API', () => {
  it('adds an entry to a given day with source "calendar"', async () => {
    const res = await send('POST', '/api/entries', {
      text: '午餐 -120',
      date: '2026-10-10',
      time: '12:30',
    });
    expect(res.status).toBe(201);
    expect((await res.json()).entry).toMatchObject({
      amount: -120,
      note: '午餐',
      source: 'calendar',
      date: '2026-10-10',
      time: '12:30',
      createdAt: '2026-10-10T04:30:00.000Z',
    });
  });

  it('defaults the time to now for today and noon for other days', async () => {
    const today = await (
      await send('POST', '/api/entries', { text: '-1 a', date: '2026-10-13' })
    ).json();
    expect(today.entry.time).toBe('12:00');
    clock = new Date('2026-10-13T20:15:00+08:00');
    const now = await (
      await send('POST', '/api/entries', { text: '-1 b', date: '2026-10-13' })
    ).json();
    expect(now.entry.time).toBe('20:15');
    const past = await (
      await send('POST', '/api/entries', { text: '-1 c', date: '2026-10-01' })
    ).json();
    expect(past.entry.time).toBe('12:00');
  });

  it('rejects bad input with a readable message', async () => {
    const res = await send('POST', '/api/entries', { text: '今天好累', date: '2026-10-10' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: 'no_amount',
      message: expect.stringMatching(/No amount/),
    });
    expect((await send('POST', '/api/entries', { text: '-1', date: '10/10' })).status).toBe(400);
    expect(
      (await send('POST', '/api/entries', { text: '-1', date: '2026-10-10', time: '25:00' }))
        .status,
    ).toBe(400);
    expect((await send('POST', '/api/entries', { date: '2026-10-10' })).status).toBe(400);
    const notJson = await app.request('/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: '1' },
      body: '{oops',
    });
    expect(notJson.status).toBe(400);
  });

  it('edits amount, note, date and time independently', async () => {
    const e = await logAt('2026-10-12T12:00:00+08:00', '-120 午餐');
    const r1 = await (
      await send('PATCH', `/api/entries/${e.id}`, { amount: -150, note: '午餐 加蛋' })
    ).json();
    expect(r1.entry).toMatchObject({
      amount: -150,
      note: '午餐 加蛋',
      date: '2026-10-12',
      time: '12:00',
    });
    const r2 = await (await send('PATCH', `/api/entries/${e.id}`, { time: '13:45' })).json();
    expect(r2.entry).toMatchObject({
      date: '2026-10-12',
      time: '13:45',
      updatedAt: expect.any(String),
    });
    const r3 = await (await send('PATCH', `/api/entries/${e.id}`, { date: '2026-10-01' })).json();
    expect(r3.entry).toMatchObject({ date: '2026-10-01', time: '13:45' });
  });

  it('rejects invalid edits and unknown ids', async () => {
    const e = await logAt('2026-10-12T12:00:00+08:00', '-120 午餐');
    expect((await send('PATCH', `/api/entries/${e.id}`, { amount: 0 })).status).toBe(400);
    expect((await send('PATCH', `/api/entries/${e.id}`, { amount: '120' })).status).toBe(400);
    expect((await send('PATCH', `/api/entries/${e.id}`, { note: 'x'.repeat(201) })).status).toBe(
      400,
    );
    expect((await send('PATCH', `/api/entries/${e.id}`, { time: '9:00' })).status).toBe(400);
    expect((await send('PATCH', '/api/entries/9999', { amount: -1 })).status).toBe(404);
    expect((await send('PATCH', '/api/entries/abc', { amount: -1 })).status).toBe(404);
  });

  it('soft-deletes an entry', async () => {
    const e = await logAt('2026-10-12T12:00:00+08:00', '-120 午餐');
    expect((await send('DELETE', `/api/entries/${e.id}`)).status).toBe(200);
    expect((await send('DELETE', `/api/entries/${e.id}`)).status).toBe(404);
    expect(await ledger.all(USER)).toEqual([]);
  });
});

describe('chat API', () => {
  it('stores both sides of the conversation and runs commands as the web surface', async () => {
    await logAt('2026-10-13T09:00:00+08:00', '-100 Discord 記的', 'text');
    const res = await send('POST', '/api/chat', { text: '午餐 -120' });
    const { messages } = await res.json();
    expect(messages.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual([
      ['user', '午餐 -120'],
      ['bot', 'Logged 午餐 -$120'],
    ]);
    expect((await ledger.all(USER)).map((e) => e.source)).toEqual(['text', 'web']);

    // /undo from the web chat removes the web entry, never the Discord one.
    const undo = await (await send('POST', '/api/chat', { text: '/undo' })).json();
    expect(undo.messages[1].content).toBe('Undid 午餐 -$120');
    const again = await (await send('POST', '/api/chat', { text: '/undo' })).json();
    expect(again.messages[1].content).toBe('Nothing to undo.');
    expect((await ledger.all(USER)).map((e) => e.note)).toEqual(['Discord 記的']);
  });

  it('links /export to the CSV endpoint', async () => {
    await logAt('2026-10-13T09:00:00+08:00', '-100 x');
    const { messages } = await (await send('POST', '/api/chat', { text: '/export' })).json();
    expect(messages[1]).toMatchObject({ content: '1 entry', attachment: '/api/export.csv' });
  });

  it('pages history', async () => {
    for (let i = 0; i < 30; i++) await send('POST', '/api/chat', { text: '/help' });
    const first = await (await get('/api/chat')).json();
    expect(first.messages).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    const older = await (await get(`/api/chat?before=${first.messages[0].id}`)).json();
    expect(older.messages).toHaveLength(10);
    expect(older.hasMore).toBe(false);
  });

  it('rejects empty and oversized messages', async () => {
    expect((await send('POST', '/api/chat', { text: '   ' })).status).toBe(400);
    expect((await send('POST', '/api/chat', { text: 'x'.repeat(501) })).status).toBe(400);
  });
});

describe('GET /api/export.csv', () => {
  it('downloads all entries as CSV', async () => {
    await logAt('2026-10-13T09:00:00+08:00', '-100 咖啡');
    const res = await get('/api/export.csv');
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="coinslot-20261013.csv"',
    );
    expect(await res.text()).toContain(',-100,咖啡,');
  });
});

describe('frontend', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coinslot-static-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('explains when the UI is not built', async () => {
    expect(await (await get('/')).text()).toMatch(/not built/);
  });

  it('serves built files and falls back to index.html for app routes', async () => {
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Coinslot</title>');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    build({ staticDir: dir });
    expect(await (await get('/')).text()).toContain('<title>Coinslot</title>');
    expect(await (await get('/assets/app.js')).text()).toBe('console.log(1)');
    expect(await (await get('/calendar/2026-10')).text()).toContain('<title>Coinslot</title>');
    expect((await get('/api/nope')).status).toBe(404);
  });
});
