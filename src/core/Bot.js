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
    // Guilds: channels, roles, interactions.
    // MessageContent (privileged): read people's messages for ticket transcripts (Transcript.js).
    //   Enabled 2026-10-26 — the bot runs on ONE server, so the 100-server verification cap does not
    //   apply. Must also be ON in the Developer Portal, or login fails with "disallowed intents".
    // GuildMembers is NOT requested: role checks use interaction.member, names come from
    //   guild.members.fetch(id), a plain REST call.
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
  });

  // Without an 'error' listener, Node turns an emitted 'error' (e.g. a gateway hiccup) into a crash.
  client.on(Events.Error, (err) => logger.error('Discord client error', { error: err.message }));
  client.on(Events.Warn, (message) => logger.warn('Discord client warning', { message }));
  client.on(Events.ShardDisconnect, (event, shardId) =>
    logger.warn('Gateway disconnected, discord.js will reconnect', { shardId, code: event?.code })
  );

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
