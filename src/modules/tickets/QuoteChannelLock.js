/**
 * Once an order has its builder (Accept on a quote or /take), the quote channel stops being a
 * job board: the builder roles lose sight of it, the chosen builder keeps it. Managers keep
 * it through their own role overwrite. From here on the channel holds the price, the payment
 * button and the work — none of it for builders who did not get the order.
 *
 * Subscribed to ticketEvents, so every way of assigning (today: Accept, /take) closes it.
 */

import { ticketEvents } from './events.js';
import { getTicketById } from './TicketRepository.js';
import { STATUS } from './TicketStatus.js';
import { getBuilderOnlyRoles } from '../../utils/permissions.js';
import { logger } from '../../utils/logger.js';

/**
 * Hide a quote channel from the builder roles, keep it for the assigned builder.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} builderId
 */
export async function closeQuoteChannelToBuilders(channel, builderId) {
  // Builder first, so they never lose the channel between the two edits.
  if (builderId) await channel.permissionOverwrites.edit(builderId, { ViewChannel: true, SendMessages: true });
  // A role that is both a builder and a manager role stays: hiding it would hide managers too.
  for (const role of getBuilderOnlyRoles(channel.guild)) {
    await channel.permissionOverwrites.edit(role.id, { ViewChannel: false });
  }
}

export function attachQuoteChannelLock(client) {
  const onStatus = ({ ticketId, type, to }) => {
    if (type !== 'order' || to !== STATUS.ASSIGNED) return;
    (async () => {
      const ticket = getTicketById(ticketId);
      if (!ticket?.freelancer_channel_id) return;
      const channel = await client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
      if (!channel?.guild) return;
      await closeQuoteChannelToBuilders(channel, ticket.assigned_freelancer_id);
      logger.info('Quote channel closed to other builders', { ticketId });
    })().catch((err) => logger.warn('Could not close quote channel', { ticketId, error: err.message }));
  };
  ticketEvents.on('status', onStatus);
  return () => ticketEvents.off('status', onStatus);
}
