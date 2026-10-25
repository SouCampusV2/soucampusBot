/**
 * Handler for close_ticket:ticketId — close a ticket of any type.
 * Who may close is decided by closeRefusal (TicketStatus.js); what closing does lives in
 * modules/tickets/closing.js (shared with the hygiene job).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { closeRefusal } from '../../modules/tickets/TicketStatus.js';
import { beginClose, archiveClosed } from '../../modules/tickets/closing.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
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
  const closed = beginClose(ticketId);
  if (!closed) {
    await interaction.reply({ content: 'This ticket is already closed.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await interaction.update({ components: [] });
    await archiveClosed(interaction.client, closed, { closedBy: interaction.user.id });
  } catch (err) {
    logger.error('close_ticket failed', { ticketId, error: err.message });
    await replyError(interaction, 'The ticket is closed, but archiving the channel failed.');
  }
}
