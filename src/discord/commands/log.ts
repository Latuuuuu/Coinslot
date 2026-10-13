import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatLogResult } from '../../core/format.js';
import type { Command } from './types.js';

export const logCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Log an entry, e.g. 午餐 -120 or 薪水 +500')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('Keyword and amount: 午餐 -120 (expense) or 薪水 +500 (income)')
        .setRequired(true)
        .setMaxLength(200),
    ),
  async execute(interaction, { ledger }) {
    const text = interaction.options.getString('text', true);
    const result = await ledger.log(interaction.user.id, text, 'slash');
    await interaction.reply({ content: formatLogResult(result), flags: MessageFlags.Ephemeral });
  },
};
