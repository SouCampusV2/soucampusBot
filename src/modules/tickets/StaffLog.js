/**
 * Staff log: one line per ticket event in the server's log channel (/setup log_channel).
 * Answers "who did what to which order, when" without digging through ticket channels.
 * Mentions are rendered but never ping (allowedMentions: none) — it is a log, not a chat.
 */

import { getSetting } from '../../core/GuildConfig.js';
import { ticketEvents } from './events.js';
import { logger } from '../../utils/logger.js';

const TYPE_LABEL = { order: 'order', help: 'help ticket', application: 'team application' };

/** Event -> log line, or null to skip. */
const FORMAT = {
  created: ({ ticketId, type, clientId }) => `🎫 New ${TYPE_LABEL[type] ?? type} \`${ticketId}\` by <@${clientId}>`,
  status: ({ ticketId, type, from, to }) => `🔄 ${TYPE_LABEL[type] ?? type} \`${ticketId}\`: ${from} → ${to}`,
  review: ({ ticketId, rating }) => `⭐ Review for order \`${ticketId}\`: ${rating}/5`,
};

/**
 * @param {import('discord.js').Client} client
 * @param {string | null} guildId
 * @param {string} line
 */
async function post(client, guildId, line) {
  try {
    const channelId = guildId ? getSetting(guildId, 'channel_log') : null;
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    await channel?.send({ content: line, allowedMentions: { parse: [] } });
  } catch (err) {
    logger.warn('Staff log post failed', { guildId, error: err.message });
  }
}

/**
 * Subscribe the log to ticket events. Returns an unsubscribe function (for tests).
 * @param {import('discord.js').Client} client
 * @returns {() => void}
 */
export function attachStaffLog(client) {
  const listeners = Object.entries(FORMAT).map(([event, format]) => {
    const listener = (e) => post(client, e.guildId, format(e));
    ticketEvents.on(event, listener);
    return [event, listener];
  });
  return () => listeners.forEach(([event, listener]) => ticketEvents.off(event, listener));
}
