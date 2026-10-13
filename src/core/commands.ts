import type { EntrySource } from '../db/repository.js';
import { formatLogResult, formatMonth, formatToday, formatUndo, formatWeek } from './format.js';
import { MONTH_TOP_COUNT, WEEK_TOP_COUNT, type Ledger, type UndoScope } from './ledger.js';
import { localDate } from './period.js';

// Text commands for chat-style surfaces (web chat, playground). Discord keeps its
// option-based slash commands, but both end up in the same Ledger + format code.

export interface CommandContext {
  ledger: Ledger;
  userId: string;
  /** Source recorded for entries logged from this surface. */
  source: EntrySource;
  /** Which entries `/undo` may remove from this surface. */
  undoScope: UndoScope;
}

export interface CommandReply {
  text: string;
  /** The surface decides how to deliver it (e.g. a download link). */
  attachment?: { kind: 'csv'; fileName: string };
}

export const COMMAND_HELP: readonly { usage: string; description: string }[] = [
  { usage: '午餐 -120', description: 'Log an expense (+500 for income)' },
  { usage: '/today', description: "Today's entries" },
  { usage: '/week [n] [-a]', description: 'This week, or week n; -a lists every entry by day' },
  { usage: '/month [n] [-a]', description: 'This month, or month n (1–12); -a lists every entry' },
  { usage: '/undo', description: 'Remove the last entry logged here' },
  { usage: '/export', description: 'Download all entries as CSV' },
  { usage: '/help', description: 'Show this list' },
];

function helpText(): string {
  return ['**Commands**', ...COMMAND_HELP.map((c) => `\`${c.usage}\` ${c.description}`)].join('\n');
}

/** `/week 18 -a` → { n: 18, detail: true }; a non-numeric number argument is an error. */
function parseArgs(args: string[]): { n?: number; detail: boolean; bad?: string } {
  const detail = args.some((a) => a === '-a' || a === '--all' || a === 'detail');
  const rest = args.filter((a) => a !== '-a' && a !== '--all' && a !== 'detail');
  const [first] = rest;
  if (first === undefined) return { detail };
  if (!/^\d+$/.test(first)) return { detail, bad: first };
  return { n: Number(first), detail };
}

export async function runCommand(input: string, ctx: CommandContext): Promise<CommandReply> {
  const text = input.trim();
  const { ledger, userId } = ctx;
  const tz = ledger.timezone;

  if (!text.startsWith('/')) {
    return { text: formatLogResult(await ledger.log(userId, text, ctx.source)) };
  }

  const [rawCommand = '', ...args] = text.split(/\s+/);
  const command = rawCommand.toLowerCase();

  switch (command) {
    case '/help':
      return { text: helpText() };

    case '/undo':
      return { text: formatUndo(await ledger.undo(userId, ctx.undoScope)) };

    case '/today':
      return { text: formatToday(await ledger.today(userId), tz) };

    case '/week': {
      const { n, detail, bad } = parseArgs(args);
      if (bad !== undefined || (n !== undefined && (n < 1 || n > 53))) {
        return { text: 'Week must be a number from 1 to 53, e.g. `/week 18 -a`.' };
      }
      const ref = ledger.weekRef(n);
      if (!ref.ok) return { text: `${ref.weekYear} has no week ${ref.weekNumber}.` };
      const summary = await ledger.period(userId, ref.range, WEEK_TOP_COUNT);
      return {
        text: formatWeek(summary, tz, {
          current: ref.isCurrent,
          showYear: !ref.isThisYear,
          detail,
        }),
      };
    }

    case '/month': {
      const { n, detail, bad } = parseArgs(args);
      if (bad !== undefined || (n !== undefined && (n < 1 || n > 12))) {
        return { text: 'Month must be a number from 1 to 12, e.g. `/month 9 -a`.' };
      }
      const ref = ledger.monthRef(n);
      const summary = await ledger.period(userId, ref.range, MONTH_TOP_COUNT);
      return { text: formatMonth(summary, tz, { current: ref.isCurrent, detail }) };
    }

    case '/export': {
      const count = (await ledger.all(userId)).length;
      if (count === 0) return { text: 'Nothing to export.' };
      return {
        text: count === 1 ? '1 entry' : `${count} entries`,
        attachment: {
          kind: 'csv',
          fileName: `coinslot-${localDate(ledger.currentTime(), tz).replace(/-/g, '')}.csv`,
        },
      };
    }

    default:
      return { text: `Unknown command \`${rawCommand}\`. Try \`/help\`.` };
  }
}
