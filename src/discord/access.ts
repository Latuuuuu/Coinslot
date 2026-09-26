import type { Config } from '../config.js';

export interface IncomingMessage {
  authorId: string;
  authorIsBot: boolean;
  channelId: string;
  /** false for direct messages */
  inGuild: boolean;
}

export function isOwner(userId: string, config: Pick<Config, 'ownerUserId'>): boolean {
  return userId === config.ownerUserId;
}

/** Plain-text entries are accepted only from the owner, in the ledger channel or a DM. */
export function shouldHandleMessage(
  message: IncomingMessage,
  config: Pick<Config, 'ownerUserId' | 'ledgerChannelId'>,
): boolean {
  if (message.authorIsBot || !isOwner(message.authorId, config)) return false;
  return !message.inGuild || message.channelId === config.ledgerChannelId;
}
