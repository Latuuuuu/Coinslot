// Registers slash commands to the private guild (updates apply immediately).
// Usage: npm run register
import { DiscordAPIError, REST, Routes } from 'discord.js';
import { loadConfig } from '../config.js';
import { loadDotEnv } from '../env.js';
import { commands } from './commands/index.js';
import { inviteUrl } from './invite.js';

loadDotEnv();
const config = loadConfig();
const rest = new REST().setToken(config.discordToken);

try {
  const body = commands.map((c) => c.data.toJSON());
  const route = Routes.applicationGuildCommands(config.discordAppId, config.guildId);
  const result = (await rest.put(route, { body })) as unknown[];
  console.log(
    `Registered ${result.length} guild commands: ${commands.map((c) => '/' + c.data.name).join(' ')}`,
  );
} catch (error) {
  if (error instanceof DiscordAPIError && error.code === 50001) {
    console.error(
      `Missing Access: the bot is not in guild ${config.guildId}, or GUILD_ID is wrong.\n` +
        `Invite it with:\n  ${inviteUrl(config.discordAppId, config.guildId)}`,
    );
  } else if (error instanceof DiscordAPIError && error.status === 401) {
    console.error('Unauthorized: DISCORD_TOKEN is invalid. Reset it in the Developer Portal.');
  } else {
    throw error;
  }
  process.exitCode = 1;
}
