import { formatReminder } from '../core/format.js';
import type { AppContext } from '../discord/context.js';
import type { Notify } from './notify.js';

/** Nightly nudge: only fires when nothing has been logged today. Returns whether it sent. */
export async function runReminder(
  { ledger, config }: AppContext,
  notify: Notify,
): Promise<boolean> {
  if (await ledger.hasEntryToday(config.ownerUserId)) return false;
  await notify(formatReminder(config.ownerUserId), { mentionUserId: config.ownerUserId });
  return true;
}
