import { AttachmentBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { splitMessage } from '../core/format.js';

/** More than this many messages is noisy; send a file instead. */
export const MAX_REPLY_MESSAGES = 5;
// Leave room for the "attached" note on the first chunk.
const CHUNK_LIMIT = 1900;

/**
 * Ephemeral reply that copes with Discord's 2000-character limit: short text is one
 * message, longer text is split at section boundaries, and very long text is sent as
 * the first section plus a .txt attachment with everything.
 */
export async function replyLong(
  interaction: ChatInputCommandInteraction,
  text: string,
  fileName: string,
): Promise<void> {
  const chunks = splitMessage(text, CHUNK_LIMIT);
  const flags = MessageFlags.Ephemeral;

  if (chunks.length > MAX_REPLY_MESSAGES) {
    const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: fileName });
    await interaction.reply({
      content: `${chunks[0]}\n\n(Too long for chat; the full detail is attached.)`,
      files: [file],
      flags,
    });
    return;
  }

  const [first = '', ...rest] = chunks;
  await interaction.reply({ content: first, flags });
  for (const chunk of rest) await interaction.followUp({ content: chunk, flags });
}
