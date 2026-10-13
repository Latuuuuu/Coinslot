import { useState } from 'react';
import { api, ApiError, type Entry } from '../api';
import { formatMoney, parseSignedAmount } from '../lib/money';

const SOURCE_LABEL: Record<Entry['source'], string> = {
  text: 'Discord',
  slash: 'Discord',
  web: '網頁聊天',
  calendar: '行事曆',
};

/** One entry; tap to edit amount / note / date / time, or delete it. */
export function EntryItem({ entry, onChanged }: { entry: Entry; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setAmount(entry.amount > 0 ? `+${entry.amount}` : String(entry.amount));
    setNote(entry.note);
    setDate(entry.date);
    setTime(entry.time);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const value = parseSignedAmount(amount);
    if (value === null) {
      setError('金額要是 1～10,000,000 的整數；收入加 +');
      return;
    }
    setBusy(true);
    try {
      await api.editEntry(entry.id, { amount: value, note, date, time });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '儲存失敗');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`刪除「${entry.note || '(no note)'} ${formatMoney(entry.amount)}」？`))
      return;
    setBusy(true);
    try {
      await api.deleteEntry(entry.id);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '刪除失敗');
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <li className="entry">
        <button className="entry-main" onClick={startEdit} aria-label="編輯這筆">
          <span className="entry-time">{entry.time}</span>
          <span className="entry-note">{entry.note || <i className="muted">(no note)</i>}</span>
          <span className={`money ${entry.amount < 0 ? 'expense' : 'income'}`}>
            {formatMoney(entry.amount)}
          </span>
        </button>
        <span className="entry-source">{SOURCE_LABEL[entry.source]}</span>
      </li>
    );
  }

  return (
    <li className="entry editing">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field-row">
          <label className="amount-field">
            金額
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              inputMode="numeric"
              aria-label="金額（支出為負、收入加 +）"
            />
          </label>
          <label className="grow">
            備註
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
        </div>
        <div className="field-row">
          <label>
            日期
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            時間
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="button" className="danger" onClick={() => void remove()} disabled={busy}>
            刪除
          </button>
          <span className="grow" />
          <button type="button" onClick={() => setEditing(false)} disabled={busy}>
            取消
          </button>
          <button type="submit" className="primary" disabled={busy}>
            儲存
          </button>
        </div>
      </form>
    </li>
  );
}
