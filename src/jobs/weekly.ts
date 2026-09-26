import { formatWeeklyReport } from '../core/format.js';
import type { AppContext } from '../discord/context.js';
import type { Notify } from './notify.js';

export async function runWeeklyReport(
  { ledger, config }: AppContext,
  notify: Notify,
): Promise<void> {
  const report = await ledger.weeklyReport(config.ownerUserId);
  await notify(formatWeeklyReport(report, config.timezone));
}
