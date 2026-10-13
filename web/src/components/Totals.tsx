import type { SpendingGroup, Totals } from '../api';
import { formatMoney } from '../lib/money';

export function TotalsLine({ totals }: { totals: Totals }) {
  return (
    <div className="totals">
      <span className="muted">{totals.count === 1 ? '1 entry' : `${totals.count} entries`}</span>
      <span>
        Spent <b className="money expense">{formatMoney(totals.spent)}</b>
      </span>
      {totals.earned > 0 && (
        <>
          <span>
            Earned <b className="money income">{formatMoney(totals.earned)}</b>
          </span>
          <span>
            Net{' '}
            <b className={`money ${totals.net < 0 ? 'expense' : 'income'}`}>
              {formatMoney(totals.net)}
            </b>
          </span>
        </>
      )}
    </div>
  );
}

export function TopSpending({ groups }: { groups: SpendingGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="top-spending">
      <h3>Top spending</h3>
      <ol>
        {groups.map((g) => (
          <li key={g.note}>
            <span className="note">
              {g.note || <i className="muted">(no note)</i>}
              {g.count > 1 && <span className="muted"> ×{g.count}</span>}
            </span>
            <span className="money expense">{formatMoney(g.total)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
