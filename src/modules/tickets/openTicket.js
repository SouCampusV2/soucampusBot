/**
 * Opening a ticket: the private channel, the row in the database, the welcome card.
 * Shared by confirmTicket (help, application, the old type menu) and the order modal from the
 * panel (orders are created only once the client has filled the brief).
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getTicketChannelName } from '../../utils/channelNaming.js';
import { getManagerRole } from '../../utils/permissions.js';
import { getSetting } from '../../core/GuildConfig.js';
import { createTicket, getTicketById } from './TicketRepository.js';
import { ticketWelcomePayload } from '../../embeds/templates.js';

/** Answer for a server where /setup was not run yet. */
export const NOT_CONFIGURED_TEXT = 'This server is not configured yet. An admin needs to run `/setup active_orders` first.';

/**
 * Category a ticket of this type is created in; help and applications fall back to the orders one.
 * @param {string} guildId
 * @param {string} type
 * @returns {string | null}
 */
export function ticketCategoryId(guildId, type) {
  const own = { help: 'category_help', application: 'category_applications' }[type];
  return (own && getSetting(guildId, own)) || getSetting(guildId, 'category_active_orders') || null;
}

/**
 * Create the private channel (client + managers) and the ticket, and post the welcome card.
 * Slow (several Discord requests): call it after deferReply/deferUpdate.
 * @param {import('discord.js').Guild} guild
 * @param {{ id: string, username?: string }} user - the client
 * @param {string} type - TICKET_TYPES value
 * @returns {Promise<{ channel: import('discord.js').TextChannel, ticket: object }>}
 */
export async function openTicketChannel(guild, user, type) {
  const overwrites = [
    { id: guild.id, deny: PermissionFlagsBits.ViewChannel },
    { id: user.id, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages },
  ];
  const managerRole = getManagerRole(guild);
  if (managerRole) {
    overwrites.push({ id: managerRole.id, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages });
  }
  const channel = await guild.channels.create({
    name: getTicketChannelName(type, user.username || 'user'),
    type: ChannelType.GuildText,
    parent: ticketCategoryId(guild.id, type),
    permissionOverwrites: overwrites,
  });
  const { id } = createTicket({ type, guildId: guild.id, clientId: user.id, clientChannelId: channel.id });
  const ticket = getTicketById(id);
  await channel.send(ticketWelcomePayload(ticket));
  return { channel, ticket };
}
