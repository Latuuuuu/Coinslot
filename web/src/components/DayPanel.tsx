import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type DayDetail } from '../api';
import { EntryItem } from './EntryItem';
import { Sheet } from './Sheet';
import { TotalsLine } from './Totals';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function dayTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m} 月 ${d} 日（${weekday}）`;
}

export function DayPanel({
  date,
  onClose,
  onChanged,
}: {
  date: string;
  onClose: () => void;
  /** Data changed (edit, delete, add): refresh the calendar. */
  onChanged: () => void;
}) {
  const [day, setDay] = useState<DayDetail | null>(null);
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .day(date)
      .then(setDay, (e: unknown) => setError(e instanceof Error ? e.message : '載入失敗'));
  }, [date]);
  useEffect(load, [load]);

  const changed = () => {
    load();
    onChanged();
  };

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addEntry({ text, date, ...(time && { time }) });
      setText('');
      setTime('');
      changed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '新增失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={dayTitle(date)} onClose={onClose}>
      {day ? (
        <>
          <TotalsLine totals={day.totals} />
          {day.entries.length === 0 ? (
            <p className="muted empty">這天沒有紀錄</p>
          ) : (
            <ul className="entries">
              {day.entries.map((e) => (
                <EntryItem key={`${e.id}-${e.updatedAt ?? ''}`} entry={e} onChanged={changed} />
              ))}
            </ul>
          )}
        </>
      ) : (
        !error && <p className="muted">載入中…</p>
      )}

      <form
        className="add-entry"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <h3>補記一筆</h3>
        <div className="field-row">
          <input
            className="grow"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="午餐 -120"
            maxLength={200}
            aria-label="內容"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="時間（選填）"
          />
          <button type="submit" className="primary" disabled={busy || !text.trim()}>
            新增
          </button>
        </div>
        <p className="hint muted">
          沒填時間：今天用現在的時間，其他日子用 12:00。補記的紀錄不會被 /undo 撤銷。
        </p>
        {error && <p className="error">{error}</p>}
      </form>
    </Sheet>
  );
}
