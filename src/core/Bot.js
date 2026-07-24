/**
 * Singleton Discord bot class — Client, login, ready event.
 */

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { logger } from '../utils/logger.js';

let botInstance = null;

/**
 * Create or return the singleton Bot (Discord Client) instance.
 * @param {{ token: string }} options
 * @returns {Client}
 */
export function getBot(options = {}) {
  if (botInstance) {
    return botInstance;
  }
  const token = options.token || process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN is required. Set it in .env.');
  }
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent, // required for order dialog (read user answers in ticket channel)
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info('Bot ready', {
      tag: readyClient.user.tag,
      id: readyClient.user.id,
      guilds: readyClient.guilds.cache.size,
    });
  });

  botInstance = client;
  return client;
}

/**
 * Start the bot — login with token.
 * @param {string} [token] - Optional override; otherwise uses process.env.DISCORD_TOKEN
 * @returns {Promise<void>}
 */
export async function startBot(token) {
  const client = getBot({ token: token || process.env.DISCORD_TOKEN });
  try {
    await client.login(token || process.env.DISCORD_TOKEN);
  } catch (err) {
    logger.error('Bot login failed', { error: err.message });
    throw err;
  }
}
