import { SlashCommandBuilder } from 'discord.js';
import { formatMonth } from '../../core/format.js';
import { MONTH_TOP_COUNT } from '../../core/ledger.js';
import { replyLong } from '../reply.js';
import type { Command } from './types.js';

export const monthCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('month')
    .setDescription('Show a month (this month by default)')
    .addIntegerOption((option) =>
      option
        .setName('month')
        .setDescription('Month 1–12 (a month not yet started means last year)')
        .setMinValue(1)
        .setMaxValue(12),
    )
    .addBooleanOption((option) =>
      option.setName('detail').setDescription('List every entry, grouped by day'),
    ),
  async execute(interaction, { ledger, config }) {
    const ref = ledger.monthRef(interaction.options.getInteger('month') ?? undefined);
    const summary = await ledger.period(interaction.user.id, ref.range, MONTH_TOP_COUNT);
    const text = formatMonth(summary, config.timezone, {
      current: ref.isCurrent,
      detail: interaction.options.getBoolean('detail') ?? false,
    });
    const month = String(ref.month).padStart(2, '0');
    await replyLong(interaction, text, `coinslot-${ref.year}-${month}.txt`);
  },
};
