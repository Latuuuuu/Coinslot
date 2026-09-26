import { Client, GatewayIntentBits, Partials } from 'discord.js';

export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    // Without Partials.Channel, messageCreate never fires for DMs.
    partials: [Partials.Channel],
    // Never ping anyone unless a send explicitly opts in (notes may contain @everyone).
    allowedMentions: { parse: [], repliedUser: false },
  });
}
