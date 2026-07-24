/**
 * Handler for edit_order:ticketId — show Edit Order modal with pre-filled fields.
 */

import { getTicketById, getTicketFields } from '../../modules/tickets/TicketRepository.js';
import { buildEditOrderModal } from '../../embeds/templates.js';

export async function handleEditOrder(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }
  const fields = getTicketFields(ticketId);
  const modal = buildEditOrderModal(ticketId, fields);
  await interaction.showModal(modal);
}
