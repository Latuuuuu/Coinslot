// Typed client for the server API (src/web/app.ts). Writes send the CSRF header.

export interface Totals {
  count: number;
  spent: number;
  earned: number;
  net: number;
}

export interface SpendingGroup {
  note: string;
  total: number;
  count: number;
  lastAt: string;
}

export type EntrySource = 'text' | 'slash' | 'web' | 'calendar';

export interface Entry {
  id: number;
  amount: number;
  note: string;
  source: EntrySource;
  createdAt: string;
  updatedAt?: string | null;
  /** Local YYYY-MM-DD */
  date: string;
  /** Local HH:mm */
  time: string;
}

export interface CalendarMonth {
  month: string;
  label: string;
  today: string;
  totals: Totals;
  topSpending: SpendingGroup[];
  days: { date: string; totals: Totals }[];
}

export interface DayDetail {
  date: string;
  totals: Totals;
  entries: Entry[];
}

export interface PeriodDetail {
  type: 'week' | 'month';
  title: string;
  isCurrent: boolean;
  totals: Totals;
  topSpending: SpendingGroup[];
  days: { date: string; totals: Totals; entries: Entry[] }[];
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  content: string;
  attachment: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(method !== 'GET' && { 'Content-Type': 'application/json', 'X-Coinslot': '1' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, err.error ?? 'error', err.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  calendar: (month: string) => request<CalendarMonth>('GET', `/api/calendar?month=${month}`),
  day: (date: string) => request<DayDetail>('GET', `/api/day/${date}`),
  week: (n: number, year: number) =>
    request<PeriodDetail>('GET', `/api/period?type=week&n=${n}&year=${year}`),
  month: (n: number, year: number) =>
    request<PeriodDetail>('GET', `/api/period?type=month&n=${n}&year=${year}`),
  addEntry: (body: { text: string; date: string; time?: string }) =>
    request<{ entry: Entry }>('POST', '/api/entries', body),
  editEntry: (id: number, body: { amount?: number; note?: string; date?: string; time?: string }) =>
    request<{ entry: Entry }>('PATCH', `/api/entries/${id}`, body),
  deleteEntry: (id: number) => request<{ entry: Entry }>('DELETE', `/api/entries/${id}`),
  chatHistory: (before?: number) =>
    request<{ messages: ChatMessage[]; hasMore: boolean }>(
      'GET',
      `/api/chat${before ? `?before=${before}` : ''}`,
    ),
  sendChat: (text: string) => request<{ messages: ChatMessage[] }>('POST', '/api/chat', { text }),
};
