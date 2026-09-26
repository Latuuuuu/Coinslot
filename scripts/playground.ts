// Interactive REPL for manually exercising the parser and ledger without Discord.
// Usage: npm run playground [-- <db path>]   (default: in-memory, nothing is saved)
import { createInterface } from 'node:readline/promises';
import { DateTime } from 'luxon';
import {
  formatLogResult,
  formatToday,
  formatUndo,
  formatWeek,
  formatWeeklyReport,
} from '../src/core/format.js';
import { Ledger } from '../src/core/ledger.js';
import { parseEntry } from '../src/core/parse.js';
import { dayRange, weekRange } from '../src/core/period.js';
import { openDatabase, SqliteEntryRepository, type Entry } from '../src/db/repository.js';

const TZ = 'Asia/Taipei';
const USER = 'playground-user';
const dbPath = process.argv[2] ?? ':memory:';

let fixedNow: Date | null = null;
const now = () => fixedNow ?? new Date();

const ledger = new Ledger({
  repository: new SqliteEntryRepository(openDatabase(dbPath)),
  timezone: TZ,
  now,
});

const HELP = `Type an entry (e.g. "午餐 -120") to log it, or a command:
  /parse <text>   parse only, do not save
  /now <time>     pretend the current time is <time> (ISO, e.g. 2026-09-27T23:59+08:00)
  /now            back to the real clock
  /range          show today's and this week's UTC ranges
  /undo /today /week /report   same output as Discord
  /all            raw rows (signed amounts, UTC timestamps)
  /help /quit`;

function taipei(iso: string): string {
  return DateTime.fromISO(iso).setZone(TZ).toFormat('yyyy-MM-dd HH:mm');
}

function line(e: Entry): string {
  return `  #${e.id}  ${taipei(e.createdAt)}  ${String(e.amount).padStart(6)}  ${e.note}   (UTC ${e.createdAt})`;
}

async function handle(input: string): Promise<boolean> {
  const [cmd = '', ...rest] = input.split(' ');
  const arg = rest.join(' ');
  switch (cmd) {
    case '':
      return true;
    case '/quit':
    case '/exit':
      return false;
    case '/help':
      console.log(HELP);
      return true;
    case '/parse':
      console.log(parseEntry(arg));
      return true;
    case '/now': {
      if (!arg) {
        fixedNow = null;
        console.log('Using the real clock.');
        return true;
      }
      const dt = DateTime.fromISO(arg, { zone: TZ });
      if (!dt.isValid) {
        console.log(`Invalid time: ${arg}`);
        return true;
      }
      fixedNow = dt.toJSDate();
      console.log(`Now = ${dt.toFormat('yyyy-MM-dd HH:mm cccc')} (Taipei)`);
      return true;
    }
    case '/range':
      console.log({ today: dayRange(now(), TZ), week: weekRange(now(), TZ) });
      return true;
    case '/undo': {
      console.log(formatUndo(await ledger.undo(USER)));
      return true;
    }
    case '/today':
      console.log(formatToday(await ledger.today(USER), TZ));
      return true;
    case '/week':
      console.log(formatWeek(await ledger.week(USER), TZ));
      return true;
    case '/report':
      console.log(formatWeeklyReport(await ledger.weeklyReport(USER), TZ));
      return true;
    case '/all':
      (await ledger.all(USER)).forEach((e) => console.log(line(e)));
      return true;
    default: {
      if (cmd.startsWith('/')) {
        console.log(`Unknown command ${cmd}. Type /help.`);
        return true;
      }
      const result = await ledger.log(USER, input, 'text');
      console.log(result.ok ? formatLogResult(result) : `Rejected: ${result.reason}`);
      return true;
    }
  }
}

console.log(`Coinslot playground — DB: ${dbPath}, TZ: ${TZ}\n${HELP}`);
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
rl.prompt();
for await (const raw of rl) {
  if (!(await handle(raw.trim()))) break;
  rl.prompt();
}
rl.close();
