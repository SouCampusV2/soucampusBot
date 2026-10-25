/**
 * Handler for close_ticket:ticketId — close a ticket of any type.
 * Who may close is decided by closeRefusal (TicketStatus.js). Closing archives the channel
 * read-only and schedules its deletion; the cleanup job deletes it, a manager can keep it.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById, setChannelDeleteAt } from '../../modules/tickets/TicketRepository.js';
import { STATUS, transitionTicket, closeRefusal } from '../../modules/tickets/TicketStatus.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { archiveChannel, archiveQuoteChannel } from '../../utils/channels.js';
import { ticketClosedText, keepChannelButtonRow } from '../../embeds/templates.js';
import { CHANNEL_DELETE_DELAY_MS } from '../../constants.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleCloseTicket(interaction, parts) {
  const ticketId = parts[1];
  const ticket = ticketId ? getTicketById(ticketId) : undefined;
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  const refusal = closeRefusal(ticket, interaction.user.id, isManagerOrAdmin(interaction.member));
  if (refusal) {
    await interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
    return;
  }
  // The transition is the real gate: a second click finds the ticket already closed.
  if (!transitionTicket(ticketId, STATUS.CLOSED)) {
    await interaction.reply({ content: 'This ticket is already closed.', flags: MessageFlags.Ephemeral });
    return;
  }
  const deleteAt = Date.now() + CHANNEL_DELETE_DELAY_MS;
  setChannelDeleteAt(ticketId, deleteAt);
  try {
    await interaction.update({ components: [] });

    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (clientChannel) {
      await clientChannel.send({
        content: ticketClosedText(interaction.user.id, deleteAt),
        components: [keepChannelButtonRow(ticketId)],
      });
      // The client and an assigned freelancer have their own overwrites in this channel.
      await archiveChannel(clientChannel, [ticket.client_id, ticket.assigned_freelancer_id], { ticketId });
    }
    // An order closed before completion was cancelled: its quote channel is dead too.
    if (ticket.freelancer_channel_id && ticket.status !== STATUS.COMPLETED) {
      const quoteChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
      if (quoteChannel) {
        await quoteChannel.send('This order was closed — no more quotes.');
        await archiveQuoteChannel(quoteChannel, { ticketId });
      }
    }
    logger.info('Ticket closed', { ticketId, by: interaction.user.id, from: ticket.status });
  } catch (err) {
    logger.error('close_ticket failed', { ticketId, error: err.message });
    await replyError(interaction, 'The ticket is closed, but archiving the channel failed.');
  }
}
