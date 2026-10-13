import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatWeek } from '../../core/format.js';
import { WEEK_TOP_COUNT } from '../../core/ledger.js';
import { replyLong } from '../reply.js';
import type { Command } from './types.js';

export const weekCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('week')
    .setDescription('Show a week (this week by default)')
    .addIntegerOption((option) =>
      option
        .setName('week')
        .setDescription('ISO week number, e.g. 18 (a week not yet started means last year)')
        .setMinValue(1)
        .setMaxValue(53),
    )
    .addBooleanOption((option) =>
      option.setName('detail').setDescription('List every entry, grouped by day'),
    ),
  async execute(interaction, { ledger, config }) {
    const ref = ledger.weekRef(interaction.options.getInteger('week') ?? undefined);
    if (!ref.ok) {
      await interaction.reply({
        content: `${ref.weekYear} has no week ${ref.weekNumber}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const summary = await ledger.period(interaction.user.id, ref.range, WEEK_TOP_COUNT);
    const text = formatWeek(summary, config.timezone, {
      current: ref.isCurrent,
      showYear: !ref.isThisYear,
      detail: interaction.options.getBoolean('detail') ?? false,
    });
    const week = String(ref.weekNumber).padStart(2, '0');
    await replyLong(interaction, text, `coinslot-${ref.weekYear}-W${week}.txt`);
  },
};
