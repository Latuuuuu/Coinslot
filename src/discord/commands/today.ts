import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatToday } from '../../core/format.js';
import type { Command } from './types.js';

export const todayCommand: Command = {
  data: new SlashCommandBuilder().setName('today').setDescription("Show today's entries"),
  async execute(interaction, { ledger, config }) {
    const summary = await ledger.today(interaction.user.id);
    await interaction.reply({
      content: formatToday(summary, config.timezone),
      flags: MessageFlags.Ephemeral,
    });
  },
};
