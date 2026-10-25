/**
 * Ticket panel posting without duplicates: on every restart the bot used to post a new panel.
 */

import { getTicketPanelPayload } from '../embeds/templates.js';
import { PREFIX } from '../constants.js';

/** How far back to look for our existing panel. */
const PANEL_LOOKBACK = 50;

/**
 * True if a message is a ticket panel posted by this bot (has our Create Ticket button).
 * @param {import('discord.js').Message} message
 * @param {string} botUserId
 */
function isOurPanel(message, botUserId) {
  if (message.author?.id !== botUserId) return false;
  return (message.components ?? []).some((row) =>
    (row.components ?? []).some((c) => c.customId === PREFIX.CREATE_TICKET)
  );
}

/**
 * Post the ticket panel in `channel` unless this bot already has one among the recent messages.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} botUserId
 * @returns {Promise<boolean>} true if a new panel was posted
 */
export async function ensurePanel(channel, botUserId) {
  const recent = await channel.messages.fetch({ limit: PANEL_LOOKBACK });
  if (recent.some((m) => isOurPanel(m, botUserId))) return false;
  await channel.send(getTicketPanelPayload(channel.guildId));
  return true;
}
