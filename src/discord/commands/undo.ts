import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatUndo } from '../../core/format.js';
import type { Command } from './types.js';

export const undoCommand: Command = {
  data: new SlashCommandBuilder().setName('undo').setDescription('Remove the last entry'),
  async execute(interaction, { ledger }) {
    const removed = await ledger.undo(interaction.user.id);
    await interaction.reply({ content: formatUndo(removed), flags: MessageFlags.Ephemeral });
  },
};
