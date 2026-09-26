import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { Cron } from 'croner';
import type { Client } from 'discord.js';
import type { AppContext } from '../discord/context.js';
import { log } from '../log.js';
import { backupDatabase } from './backup.js';
import { sendHeartbeat } from './heartbeat.js';
import { channelNotifier } from './notify.js';
import { runReminder } from './reminder.js';
import { runWeeklyReport } from './weekly.js';

/** Nightly backup time (local). Late enough that the day's entries are in. */
const BACKUP_PATTERN = '0 4 * * *';

function job(name: string, pattern: string, timezone: string, fn: () => Promise<unknown>): Cron {
  return new Cron(pattern, { name, timezone, protect: true }, async () => {
    try {
      await fn();
    } catch (error) {
      log.error(`Job ${name} failed`, error);
    }
  });
}

export function startJobs(client: Client, ctx: AppContext, db: Database.Database): Cron[] {
  const { config } = ctx;
  const tz = config.timezone;
  const notify = channelNotifier(client, config.ledgerChannelId);
  const { reminderTime: r, weeklyReport: w } = config;

  const jobs = [
    job('reminder', `${r.minute} ${r.hour} * * *`, tz, async () => {
      const sent = await runReminder(ctx, notify);
      log.info(`Reminder ${sent ? 'sent' : 'skipped (already logged today)'}`);
    }),
    // Cron weekday: 0 = Sunday; config uses ISO (7 = Sunday).
    job('weekly-report', `${w.minute} ${w.hour} * * ${w.weekday % 7}`, tz, async () => {
      await runWeeklyReport(ctx, notify);
      log.info('Weekly report sent');
    }),
    job('backup', BACKUP_PATTERN, tz, async () => {
      const { file, pruned } = await backupDatabase(
        db,
        join(dirname(config.dbPath), 'backups'),
        new Date(),
        tz,
      );
      log.info(`Backup written to ${file}, pruned ${pruned.length}`);
    }),
  ];

  const pushUrl = config.uptimeKumaPushUrl;
  if (pushUrl) {
    jobs.push(
      job('heartbeat', '* * * * *', tz, async () => {
        // Only report "up" while the gateway connection is healthy.
        if (client.isReady()) await sendHeartbeat(pushUrl);
      }),
    );
  }

  for (const j of jobs) log.info(`Scheduled ${j.name}: next run ${j.nextRun()?.toISOString()}`);
  return jobs;
}
