/**
 * Handler for edit_order:ticketId — show Edit Order modal with pre-filled fields.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById, getTicketFields } from '../../modules/tickets/TicketRepository.js';
import { buildEditOrderModal, EDIT_CLOSED_TEXT } from '../../embeds/templates.js';
import { STATUS } from '../../modules/tickets/TicketStatus.js';
import { ensureTicketClient } from '../../utils/permissions.js';

export async function handleEditOrder(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await ensureTicketClient(interaction, ticket))) return;
  // Before submitting (form) and while collecting quotes (open); not once a freelancer took it.
  if (![STATUS.FORM, STATUS.OPEN].includes(ticket.status)) {
    await interaction.reply({ content: EDIT_CLOSED_TEXT, flags: MessageFlags.Ephemeral });
    return;
  }
  const fields = getTicketFields(ticketId);
  const modal = buildEditOrderModal(ticketId, fields);
  await interaction.showModal(modal);
}
