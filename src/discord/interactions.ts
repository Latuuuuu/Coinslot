import { Events, MessageFlags, type Client } from 'discord.js';
import { log } from '../log.js';
import { isOwner } from './access.js';
import { commandsByName } from './commands/index.js';
import type { AppContext } from './context.js';

export function registerInteractionHandler(client: Client, ctx: AppContext): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (!isOwner(interaction.user.id, ctx.config)) {
      await interaction
        .reply({ content: 'Not authorized.', flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
      return;
    }

    const command = commandsByName.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, ctx);
    } catch (error) {
      log.error(`/${interaction.commandName} failed`, error);
      const reply = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral } as const;
      await (
        interaction.replied || interaction.deferred
          ? interaction.followUp(reply)
          : interaction.reply(reply)
      ).catch(() => undefined);
    }
  });
}
