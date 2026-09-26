import { Events, type Client } from 'discord.js';
import { formatLogResult } from '../core/format.js';
import { log } from '../log.js';
import { shouldHandleMessage } from './access.js';
import type { AppContext } from './context.js';

export function registerMessageHandler(client: Client, ctx: AppContext): void {
  client.on(Events.MessageCreate, async (message) => {
    const incoming = {
      authorId: message.author.id,
      authorIsBot: message.author.bot,
      channelId: message.channelId,
      inGuild: message.inGuild(),
    };
    if (!shouldHandleMessage(incoming, ctx.config)) return;

    try {
      const result = await ctx.ledger.log(message.author.id, message.content, 'text');
      if (result.ok || result.reason === 'invalid_amount') {
        await message.reply(formatLogResult(result));
      } else if (result.reason === 'no_amount') {
        // Stay quiet for chatter; a reaction is enough to flag a likely typo.
        await message.react('❓');
      }
    } catch (error) {
      log.error('Failed to handle message', error);
      await message.react('⚠️').catch(() => undefined);
    }
  });
}
