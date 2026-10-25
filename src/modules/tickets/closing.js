/**
 * Closing a ticket — shared by the Close ticket button and the hygiene job (abandoned forms).
 *
 * Two steps on purpose:
 *   beginClose      — synchronous: the status transition (the gate) + deletion schedule.
 *                     Callers answer the interaction right after it, within Discord's 3 seconds.
 *   archiveClosed   — slow: notices, archive category, read-only locks.
 */

import { getTicketById, setChannelDeleteAt } from './TicketRepository.js';
import { STATUS, transitionTicket } from './TicketStatus.js';
import { archiveChannel, archiveQuoteChannel } from '../../utils/channels.js';
import { ticketClosedText, keepChannelButtonRow } from '../../embeds/templates.js';
import { CHANNEL_DELETE_DELAY_MS } from '../../constants.js';
import { logger } from '../../utils/logger.js';

/**
 * Move the ticket to CLOSED and schedule its channel's deletion. Permission checks are the
 * caller's job.
 * @param {string} ticketId
 * @returns {{ ticket: object, deleteAt: number } | null} the ticket as it was BEFORE closing,
 *   or null if it was already closed / cannot be closed (a second click lands here)
 */
export function beginClose(ticketId) {
  const ticket = getTicketById(ticketId);
  if (!ticket || !transitionTicket(ticketId, STATUS.CLOSED)) return null;
  const deleteAt = Date.now() + CHANNEL_DELETE_DELAY_MS;
  setChannelDeleteAt(ticketId, deleteAt);
  return { ticket, deleteAt };
}

/**
 * Post the closed notice and archive the ticket's channels read-only.
 * @param {import('discord.js').Client} client
 * @param {{ ticket: object, deleteAt: number }} closed - from beginClose
 * @param {{ closedBy: string, note?: string }} by - user id, or the bot's own id for automatic closes
 */
export async function archiveClosed(client, { ticket, deleteAt }, { closedBy, note }) {
  const clientChannel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
  if (clientChannel) {
    await clientChannel.send({
      content: (note ? `${note}\n` : '') + ticketClosedText(closedBy, deleteAt),
      components: [keepChannelButtonRow(ticket.id)],
    });
    // The client and an assigned freelancer have their own overwrites in this channel.
    await archiveChannel(clientChannel, [ticket.client_id, ticket.assigned_freelancer_id], { ticketId: ticket.id });
  }
  // An order closed before completion was cancelled: its quote channel is dead too.
  if (ticket.freelancer_channel_id && ticket.status !== STATUS.COMPLETED) {
    const quoteChannel = await client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    if (quoteChannel) {
      await quoteChannel.send('This order was closed — no more quotes.');
      await archiveQuoteChannel(quoteChannel, { ticketId: ticket.id });
    }
  }
  logger.info('Ticket closed', { ticketId: ticket.id, by: closedBy, from: ticket.status });
}
