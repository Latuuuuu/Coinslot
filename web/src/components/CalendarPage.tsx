import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type CalendarMonth } from '../api';
import { addMonths, heatLevel, monthGrid } from '../lib/calendar';
import { compactMoney } from '../lib/money';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { DayPanel } from './DayPanel';
import { PeriodPanel, type PeriodRef } from './PeriodPanel';
import { TopSpending, TotalsLine } from './Totals';

const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'];

function currentMonth(): string {
  // Taipei is the ledger's zone; the server confirms it via `today` on first load.
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 7);
}

export function CalendarPage({ version, onChanged }: { version: number; onChanged: () => void }) {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openPeriod, setOpenPeriod] = useState<PeriodRef | null>(null);

  const load = useCallback(() => {
    api.calendar(month).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : '載入失敗'),
    );
  }, [month]);
  useEffect(load, [load, version]);
  useAutoRefresh(load);

  const grid = useMemo(() => monthGrid(month), [month]);
  const byDate = useMemo(() => new Map(data?.days.map((d) => [d.date, d.totals])), [data]);
  const maxSpent = useMemo(
    () => Math.min(0, ...(data?.days.map((d) => d.totals.spent) ?? [0])),
    [data],
  );
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const today = data?.today ?? '';

  return (
    <div className="page calendar-page">
      <div className="month-nav">
        <button
          className="icon-button"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="上個月"
        >
          ‹
        </button>
        <h2>
          {year} 年 {monthNumber} 月
        </h2>
        <button
          className="icon-button"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="下個月"
        >
          ›
        </button>
        {today && month !== today.slice(0, 7) && (
          <button className="today-button" onClick={() => setMonth(today.slice(0, 7))}>
            今天
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="calendar" role="grid" aria-label={`${year} 年 ${monthNumber} 月`}>
        <div className="calendar-row header" role="row">
          <span className="week-col muted">週</span>
          {WEEKDAY_HEADERS.map((d) => (
            <span key={d} role="columnheader">
              {d}
            </span>
          ))}
        </div>
        {grid.map((week) => (
          <div className="calendar-row" role="row" key={week.days[0]!.date}>
            <button
              className="week-col week-button"
              onClick={() =>
                setOpenPeriod({ type: 'week', n: week.weekNumber, year: week.weekYear })
              }
              aria-label={`第 ${week.weekNumber} 週明細`}
            >
              W{week.weekNumber}
            </button>
            {week.days.map((day) => {
              const totals = byDate.get(day.date);
              const future = today !== '' && day.date > today;
              const classes = [
                'day',
                day.inMonth ? '' : 'outside',
                day.date === today ? 'today' : '',
                future ? 'future' : '',
                `heat-${totals ? heatLevel(totals.spent, maxSpent) : 0}`,
              ].join(' ');
              return (
                <button
                  key={day.date}
                  className={classes}
                  onClick={() => setOpenDay(day.date)}
                  role="gridcell"
                  aria-label={`${day.date}${totals ? `，支出 ${-totals.spent}` : ''}`}
                >
                  <span className="day-number">{day.day}</span>
                  {totals && totals.spent < 0 && (
                    <span className="day-amount">{compactMoney(totals.spent)}</span>
                  )}
                  {totals && totals.earned > 0 && (
                    <span className="income-dot" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {data && (
        <section className="card month-summary">
          <div className="card-header">
            <h3>{data.label}</h3>
            <button onClick={() => setOpenPeriod({ type: 'month', n: monthNumber, year })}>
              每日明細 ›
            </button>
          </div>
          {data.totals.count === 0 ? (
            <p className="muted">這個月還沒有紀錄</p>
          ) : (
            <>
              <TotalsLine totals={data.totals} />
              <TopSpending groups={data.topSpending} />
            </>
          )}
        </section>
      )}

      {openPeriod && (
        <PeriodPanel
          period={openPeriod}
          version={version}
          onClose={() => setOpenPeriod(null)}
          onOpenDay={(date) => {
            setOpenPeriod(null);
            setOpenDay(date);
          }}
        />
      )}
      {openDay && (
        <DayPanel date={openDay} onClose={() => setOpenDay(null)} onChanged={onChanged} />
      )}
    </div>
  );
}
