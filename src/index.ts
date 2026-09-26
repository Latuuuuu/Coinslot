import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Cron } from 'croner';
import { Events } from 'discord.js';
import { loadConfig } from './config.js';
import { Ledger } from './core/ledger.js';
import { openDatabase, SqliteEntryRepository } from './db/repository.js';
import { createClient } from './discord/client.js';
import { registerInteractionHandler } from './discord/interactions.js';
import { registerMessageHandler } from './discord/messages.js';
import { loadDotEnv } from './env.js';
import { startJobs } from './jobs/scheduler.js';
import { log } from './log.js';

loadDotEnv();
const config = loadConfig();

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = openDatabase(config.dbPath, {
  onMigrated: ({ applied, backupFile }) =>
    log.info(
      `Applied migrations ${applied.join(', ')}` + (backupFile ? `; backup: ${backupFile}` : ''),
    ),
});
const ledger = new Ledger({
  repository: new SqliteEntryRepository(db),
  timezone: config.timezone,
});
const ctx = { config, ledger };

const client = createClient();
registerMessageHandler(client, ctx);
registerInteractionHandler(client, ctx);

let jobs: Cron[] = [];
client.once(Events.ClientReady, (ready) => {
  log.info(`Logged in as ${ready.user.tag}`);
  jobs = startJobs(client, ctx, db);
});

async function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`);
  jobs.forEach((j) => j.stop());
  await client.destroy();
  db.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await client.login(config.discordToken);
} catch (error) {
  if (error instanceof Error && error.message === 'Used disallowed intents') {
    log.error(
      'Message Content Intent is not enabled. Turn it on in the Developer Portal: ' +
        `https://discord.com/developers/applications/${config.discordAppId}/bot`,
    );
  } else {
    log.error('Login failed', error);
  }
  db.close();
  process.exit(1);
}
