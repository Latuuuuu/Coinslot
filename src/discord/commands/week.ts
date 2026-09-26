import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatWeek } from '../../core/format.js';
import type { Command } from './types.js';

export const weekCommand: Command = {
  data: new SlashCommandBuilder().setName('week').setDescription("Show this week's total"),
  async execute(interaction, { ledger, config }) {
    const summary = await ledger.week(interaction.user.id);
    await interaction.reply({
      content: formatWeek(summary, config.timezone),
      flags: MessageFlags.Ephemeral,
    });
  },
};
