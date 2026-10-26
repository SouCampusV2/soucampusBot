/**
 * The ticket panel: one per channel, updated in place.
 * Without this the bot posted a new panel on every restart, and /setup panel stacked copies.
 */

import { getTicketPanelPayload } from '../embeds/templates.js';
import { PREFIX } from '../constants.js';
import { logger } from './logger.js';

/** How far back to look for our existing panel. */
const PANEL_LOOKBACK = 50;

/** Any create_ticket button anywhere in the component tree (classic rows and V2 containers). */
function hasCreateTicketButton(node) {
  if (Array.isArray(node)) return node.some(hasCreateTicketButton);
  if (!node || typeof node !== 'object') return false;
  const id = node.customId ?? node.custom_id ?? node.data?.custom_id;
  if (typeof id === 'string' && (id === PREFIX.CREATE_TICKET || id.startsWith(`${PREFIX.CREATE_TICKET}:`))) return true;
  return hasCreateTicketButton(node.components) || hasCreateTicketButton(node.accessory);
}

/**
 * True if a message is a ticket panel posted by this bot.
 * @param {import('discord.js').Message} message
 * @param {string} botUserId
 */
function isOurPanel(message, botUserId) {
  return message.author?.id === botUserId && hasCreateTicketButton(message.components ?? []);
}

async function findPanel(channel, botUserId) {
  const recent = await channel.messages.fetch({ limit: PANEL_LOOKBACK });
  return recent.find((m) => isOurPanel(m, botUserId)) ?? null;
}

/**
 * Post the ticket panel in `channel` unless this bot already has one there (startup, .env mode).
 * @param {import('discord.js').TextChannel} channel
 * @param {string} botUserId
 * @returns {Promise<boolean>} true if a new panel was posted
 */
export async function ensurePanel(channel, botUserId) {
  if (await findPanel(channel, botUserId)) return false;
  await channel.send(getTicketPanelPayload(channel.guildId, { guildName: channel.guild?.name }));
  return true;
}

/**
 * /setup panel: replace our existing panel in place with the current design, or post one.
 * An old embed panel cannot always be turned into a V2 message by an edit — then it is
 * replaced (new posted, old deleted), so the channel still ends with exactly one panel.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} botUserId
 * @returns {Promise<'updated' | 'posted'>}
 */
export async function upsertPanel(channel, botUserId) {
  const payload = getTicketPanelPayload(channel.guildId, { guildName: channel.guild?.name });
  const existing = await findPanel(channel, botUserId);
  if (!existing) {
    await channel.send(payload);
    return 'posted';
  }
  try {
    // V2 messages may not carry content or embeds.
    await existing.edit({ ...payload, content: null, embeds: [] });
    return 'updated';
  } catch (err) {
    logger.info('Panel could not be edited into the new design — replacing it', { error: err.message });
    await channel.send(payload);
    await existing.delete().catch(() => {});
    return 'updated';
  }
}
