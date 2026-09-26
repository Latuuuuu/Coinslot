import { describe, expect, it } from 'vitest';
import { isOwner, shouldHandleMessage } from '../src/discord/access.js';

const config = { ownerUserId: 'owner', ledgerChannelId: 'ledger' };
const base = { authorId: 'owner', authorIsBot: false, channelId: 'ledger', inGuild: true };

describe('shouldHandleMessage', () => {
  it('accepts the owner in the ledger channel or a DM', () => {
    expect(shouldHandleMessage(base, config)).toBe(true);
    expect(shouldHandleMessage({ ...base, channelId: 'dm', inGuild: false }, config)).toBe(true);
  });

  it('ignores other channels, other users and bots', () => {
    expect(shouldHandleMessage({ ...base, channelId: 'general' }, config)).toBe(false);
    expect(shouldHandleMessage({ ...base, authorId: 'someone' }, config)).toBe(false);
    expect(shouldHandleMessage({ ...base, authorId: 'someone', inGuild: false }, config)).toBe(
      false,
    );
    expect(shouldHandleMessage({ ...base, authorIsBot: true }, config)).toBe(false);
  });
});

describe('isOwner', () => {
  it('matches only the configured user', () => {
    expect(isOwner('owner', config)).toBe(true);
    expect(isOwner('other', config)).toBe(false);
  });
});
