import { formatMonthlyReport } from '../core/format.js';
import type { AppContext } from '../discord/context.js';
import type { Notify } from './notify.js';

/** Posts last month's report (meant to run early in the new month). */
export async function runMonthlyReport(
  { ledger, config }: AppContext,
  notify: Notify,
): Promise<void> {
  const report = await ledger.monthlyReport(config.ownerUserId);
  await notify(formatMonthlyReport(report, config.timezone));
}
