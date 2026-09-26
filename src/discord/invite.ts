import { OAuth2Scopes, PermissionFlagsBits, PermissionsBitField } from 'discord.js';

/** Minimum permissions: read the ledger channel, reply, react, attach the CSV export. */
export const BOT_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.AttachFiles,
]);

export function inviteUrl(appId: string, guildId?: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    scope: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands].join(' '),
    permissions: BOT_PERMISSIONS.bitfield.toString(),
  });
  if (guildId) {
    params.set('guild_id', guildId);
    params.set('disable_guild_select', 'true');
  }
  return `https://discord.com/oauth2/authorize?${params}`;
}
