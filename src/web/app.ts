import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { groupByLocalDay, localDateOf, localTimeOf } from '../core/calendar.js';
import { runCommand } from '../core/commands.js';
import { formatLogResult, monthLabel, toCsv, weekLabel } from '../core/format.js';
import {
  MONTH_TOP_COUNT,
  WEEK_TOP_COUNT,
  type Ledger,
  type PeriodSummary,
} from '../core/ledger.js';
import {
  localDate,
  localDateTimeToUtc,
  localMonthRange,
  monthOf,
  resolveMonth,
  resolveWeek,
  weekOf,
} from '../core/period.js';
import type { ChatMessage, ChatRepository, Entry } from '../db/repository.js';

export interface WebAppOptions {
  ledger: Ledger;
  chat: ChatRepository;
  /** The single user the UI acts as (OWNER_USER_ID). */
  userId: string;
  /** Tailscale logins allowed in; empty = no check (e.g. local development). */
  allowedUsers?: readonly string[];
  /** Built frontend (dist/public); omitted or missing = API only. */
  staticDir?: string;
}

/** Custom header the frontend sends on writes; cross-site forms cannot set it (CSRF guard). */
export const CSRF_HEADER = 'x-coinslot';
const MAX_CHAT_LENGTH = 500;
const CHAT_PAGE = 50;

/** Entry as the UI needs it: plus local date and time. */
export interface EntryDto extends Entry {
  date: string;
  time: string;
}

function toDto(e: Entry, tz: string): EntryDto {
  return { ...e, date: localDateOf(e.createdAt, tz), time: localTimeOf(e.createdAt, tz) };
}

function periodDto(summary: PeriodSummary, title: string, tz: string) {
  return {
    title,
    range: summary.range,
    totals: summary.totals,
    topSpending: summary.topSpending,
    days: groupByLocalDay(summary.entries, tz).map((d) => ({
      date: d.date,
      totals: d.totals,
      entries: d.entries.map((e) => toDto(e, tz)),
    })),
  };
}

const badRequest = (c: Context, error: string, message: string) => c.json({ error, message }, 400);
const notFound = (c: Context, message = 'Not found') =>
  c.json({ error: 'not_found', message }, 404);

async function jsonBody(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is string =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function createWebApp({
  ledger,
  chat,
  userId,
  allowedUsers = [],
  staticDir,
}: WebAppOptions): Hono {
  const app = new Hono();
  const tz = ledger.timezone;
  const allowed = new Set(allowedUsers.map((u) => u.toLowerCase()));

  // ---------------------------------------------------------------- guards
  app.use('*', async (c, next) => {
    // `tailscale serve` adds the visitor's login; with an allow-list, nobody else gets in.
    if (allowed.size > 0) {
      const login = c.req.header('tailscale-user-login')?.toLowerCase();
      if (!login || !allowed.has(login)) return c.text('Forbidden', 403);
    }
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
  });

  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header(CSRF_HEADER) !== '1') {
      return c.json({ error: 'forbidden', message: 'Missing request header' }, 403);
    }
    await next();
  });

  // ---------------------------------------------------------------- read
  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/calendar', async (c) => {
    const now = ledger.currentTime();
    const month = c.req.query('month') ?? localDate(now, tz).slice(0, 7);
    const range = localMonthRange(month, tz);
    if (!range) return badRequest(c, 'invalid_month', 'Use month=YYYY-MM');
    const summary = await ledger.period(userId, range, MONTH_TOP_COUNT);
    return c.json({
      month,
      label: monthLabel(range, tz),
      today: localDate(now, tz),
      totals: summary.totals,
      topSpending: summary.topSpending,
      days: groupByLocalDay(summary.entries, tz).map((d) => ({ date: d.date, totals: d.totals })),
    });
  });

  app.get('/api/day/:date', async (c) => {
    const date = c.req.param('date');
    const day = await ledger.day(userId, date);
    if (!day) return badRequest(c, 'invalid_date', 'Use YYYY-MM-DD');
    return c.json({ date, totals: day.totals, entries: day.entries.map((e) => toDto(e, tz)) });
  });

  app.get('/api/period', async (c) => {
    const type = c.req.query('type');
    const nRaw = c.req.query('n');
    const n = nRaw === undefined || nRaw === '' ? undefined : Number(nRaw);
    if (n !== undefined && !Number.isInteger(n)) {
      return badRequest(c, 'invalid_n', 'n must be an integer');
    }
    // Optional explicit year (the calendar browsing past years); without it the
    // chat's cross-year rule applies.
    const yearRaw = c.req.query('year');
    const year = yearRaw === undefined || yearRaw === '' ? undefined : Number(yearRaw);
    if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      return badRequest(c, 'invalid_year', 'year must be 2000–2100');
    }
    if (year !== undefined && n === undefined) return badRequest(c, 'invalid_n', 'year needs n');
    const now = ledger.currentTime();

    if (type === 'week') {
      if (n !== undefined && (n < 1 || n > 53)) return badRequest(c, 'invalid_n', 'Week is 1–53');
      const ref =
        year !== undefined && n !== undefined ? weekOf(now, tz, year, n) : resolveWeek(now, tz, n);
      if (!ref.ok) return notFound(c, `${ref.weekYear} has no week ${ref.weekNumber}.`);
      const summary = await ledger.period(userId, ref.range, WEEK_TOP_COUNT);
      const label = weekLabel(ref.range, tz, !ref.isThisYear);
      return c.json({
        type,
        weekNumber: ref.weekNumber,
        weekYear: ref.weekYear,
        isCurrent: ref.isCurrent,
        ...periodDto(summary, ref.isCurrent ? `This week · ${label}` : label, tz),
      });
    }
    if (type === 'month') {
      if (n !== undefined && (n < 1 || n > 12)) return badRequest(c, 'invalid_n', 'Month is 1–12');
      const ref =
        year !== undefined && n !== undefined
          ? monthOf(now, tz, year, n)
          : resolveMonth(now, tz, n);
      const summary = await ledger.period(userId, ref.range, MONTH_TOP_COUNT);
      const label = monthLabel(ref.range, tz);
      return c.json({
        type,
        month: ref.month,
        year: ref.year,
        isCurrent: ref.isCurrent,
        ...periodDto(summary, ref.isCurrent ? `This month · ${label}` : label, tz),
      });
    }
    return badRequest(c, 'invalid_type', 'type must be week or month');
  });

  app.get('/api/export.csv', async (c) => {
    const rows = await ledger.all(userId);
    const date = localDate(ledger.currentTime(), tz).replace(/-/g, '');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="coinslot-${date}.csv"`);
    return c.body(toCsv(rows, tz));
  });

  // ---------------------------------------------------------------- entries (calendar)
  app.post('/api/entries', async (c) => {
    const body = await jsonBody(c);
    if (!body || typeof body.text !== 'string')
      return badRequest(c, 'invalid_body', 'text is required');
    if (!isDate(body.date)) return badRequest(c, 'invalid_date', 'date must be YYYY-MM-DD');
    if (body.time !== undefined && !isTime(body.time)) {
      return badRequest(c, 'invalid_time', 'time must be HH:MM');
    }
    // Default time: now for today, noon for other days.
    const now = ledger.currentTime();
    const time =
      (body.time as string | undefined) ??
      (body.date === localDate(now, tz) ? localTimeOf(now.toISOString(), tz) : '12:00');
    const createdAt = localDateTimeToUtc(body.date, time, tz);
    if (!createdAt) return badRequest(c, 'invalid_date', 'Invalid date or time');

    const result = await ledger.log(userId, body.text, 'calendar', createdAt);
    if (!result.ok) return badRequest(c, result.reason, formatLogResult(result));
    return c.json({ entry: toDto(result.entry, tz) }, 201);
  });

  app.patch('/api/entries/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const body = await jsonBody(c);
    if (!body) return badRequest(c, 'invalid_body', 'JSON body required');
    const current = await ledger.entry(userId, id);
    if (!current) return notFound(c);

    if (body.amount !== undefined && typeof body.amount !== 'number') {
      return badRequest(c, 'invalid_amount', 'amount must be a number');
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      return badRequest(c, 'invalid_note', 'note must be a string');
    }
    if (typeof body.note === 'string' && body.note.length > 200) {
      return badRequest(c, 'invalid_note', 'note is too long');
    }
    if (body.date !== undefined && !isDate(body.date)) {
      return badRequest(c, 'invalid_date', 'date must be YYYY-MM-DD');
    }
    if (body.time !== undefined && !isTime(body.time)) {
      return badRequest(c, 'invalid_time', 'time must be HH:MM');
    }

    let createdAt: string | undefined;
    if (body.date !== undefined || body.time !== undefined) {
      const date = (body.date as string | undefined) ?? localDateOf(current.createdAt, tz);
      const time = (body.time as string | undefined) ?? localTimeOf(current.createdAt, tz);
      createdAt = localDateTimeToUtc(date, time, tz) ?? undefined;
      if (!createdAt) return badRequest(c, 'invalid_date', 'Invalid date or time');
    }

    const result = await ledger.edit(userId, id, {
      ...(body.amount !== undefined && { amount: body.amount as number }),
      ...(body.note !== undefined && { note: body.note as string }),
      ...(createdAt !== undefined && { createdAt }),
    });
    if (!result.ok) {
      return result.reason === 'not_found'
        ? notFound(c)
        : badRequest(c, result.reason, 'Amount must be a non-zero whole number up to 10,000,000');
    }
    return c.json({ entry: toDto(result.entry, tz) });
  });

  app.delete('/api/entries/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return notFound(c);
    const removed = await ledger.remove(userId, id);
    return removed ? c.json({ entry: toDto(removed, tz) }) : notFound(c);
  });

  // ---------------------------------------------------------------- chat
  app.get('/api/chat', async (c) => {
    const beforeRaw = c.req.query('before');
    const before = beforeRaw ? Number(beforeRaw) : null;
    if (before !== null && !Number.isInteger(before))
      return badRequest(c, 'invalid_before', 'before must be an id');
    const messages = await chat.listBefore(userId, before, CHAT_PAGE);
    return c.json({ messages, hasMore: messages.length === CHAT_PAGE });
  });

  app.post('/api/chat', async (c) => {
    const body = await jsonBody(c);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return badRequest(c, 'empty', 'Message is empty');
    if (text.length > MAX_CHAT_LENGTH) return badRequest(c, 'too_long', 'Message is too long');

    const at = () => ledger.currentTime().toISOString();
    const userMessage = await chat.append({
      userId,
      role: 'user',
      content: text,
      attachment: null,
      createdAt: at(),
    });
    const reply = await runCommand(text, { ledger, userId, source: 'web', undoScope: 'web' });
    const botMessage: ChatMessage = await chat.append({
      userId,
      role: 'bot',
      content: reply.text,
      attachment: reply.attachment ? '/api/export.csv' : null,
      createdAt: at(),
    });
    return c.json({ messages: [userMessage, botMessage] });
  });

  app.all('/api/*', (c) => notFound(c));

  // ---------------------------------------------------------------- frontend
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    const indexHtml = readFileSync(join(staticDir, 'index.html'), 'utf8');
    app.use('/*', serveStatic({ root: staticDir }));
    // Single-page app: unknown paths get the app shell.
    app.get('*', (c) => c.html(indexHtml));
  } else {
    app.get('/', (c) =>
      c.text('Coinslot API is running. The web UI is not built (npm run build:web).'),
    );
  }

  return app;
}
