import type { Client } from 'discord.js';

export type Notify = (content: string, options?: { mentionUserId?: string }) => Promise<void>;

/** Posts to the ledger channel. Mentions are suppressed unless explicitly requested. */
export function channelNotifier(client: Client, channelId: string): Notify {
  return async (content, options = {}) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) throw new Error(`Channel ${channelId} is not sendable`);
    await channel.send({
      content,
      allowedMentions: { parse: [], users: options.mentionUserId ? [options.mentionUserId] : [] },
    });
  };
}
