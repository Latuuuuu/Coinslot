import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { toCsv } from '../../core/format.js';
import { localDate } from '../../core/period.js';
import type { Command } from './types.js';

export const exportCommand: Command = {
  data: new SlashCommandBuilder().setName('export').setDescription('Download all entries as CSV'),
  async execute(interaction, { ledger, config }) {
    const rows = await ledger.all(interaction.user.id);
    if (rows.length === 0) {
      await interaction.reply({ content: 'Nothing to export.', flags: MessageFlags.Ephemeral });
      return;
    }
    const date = localDate(new Date(), config.timezone).replace(/-/g, '');
    const file = new AttachmentBuilder(Buffer.from(toCsv(rows, config.timezone), 'utf8'), {
      name: `coinslot-${date}.csv`,
    });
    await interaction.reply({
      content: `${rows.length} entries`,
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
  },
};
