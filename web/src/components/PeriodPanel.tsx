import { useEffect, useState } from 'react';
import { api, type PeriodDetail } from '../api';
import { formatMoney } from '../lib/money';
import { Sheet } from './Sheet';
import { TopSpending, TotalsLine } from './Totals';

export type PeriodRef = { type: 'week' | 'month'; n: number; year: number };

/** A week or month: totals, top spending and every entry by day (like `/week n -a`). */
export function PeriodPanel({
  period,
  version,
  onClose,
  onOpenDay,
}: {
  period: PeriodRef;
  version: number;
  onClose: () => void;
  onOpenDay: (date: string) => void;
}) {
  const [data, setData] = useState<PeriodDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = period.type === 'week' ? api.week : api.month;
    load(period.n, period.year).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : '載入失敗'),
    );
  }, [period, version]);

  return (
    <Sheet title={data?.title ?? (period.type === 'week' ? `W${period.n}` : '…')} onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <TotalsLine totals={data.totals} />
          <TopSpending groups={data.topSpending} />
          {data.days.length === 0 && <p className="muted empty">沒有紀錄</p>}
          {data.days.map((d) => (
            <div key={d.date} className="period-day">
              <button className="period-day-header" onClick={() => onOpenDay(d.date)}>
                <span>{d.date.slice(5).replace('-', '/')}</span>
                <span className="money expense">{formatMoney(d.totals.spent)}</span>
                {d.totals.earned > 0 && (
                  <span className="money income">{formatMoney(d.totals.earned)}</span>
                )}
                <span className="muted">›</span>
              </button>
              <ul className="period-entries">
                {d.entries.map((e) => (
                  <li key={e.id}>
                    <span className="entry-time">{e.time}</span>
                    <span className="entry-note">
                      {e.note || <i className="muted">(no note)</i>}
                    </span>
                    <span className={`money ${e.amount < 0 ? 'expense' : 'income'}`}>
                      {formatMoney(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}
