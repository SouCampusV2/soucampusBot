/**
 * Handler for edit_order_modal:ticketId — modal submit: update ticket_fields and re-post order summary.
 */

import {
  getTicketById,
  getTicketFields,
  saveTicketField,
  updateTicketDeadline,
} from '../../modules/tickets/TicketRepository.js';
import { getOrderSummaryPayload, EDIT_ORDER_MODAL_FIELDS } from '../../embeds/templates.js';
import { logger } from '../../utils/logger.js';

export async function handleEditOrderModal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channel not found.', ephemeral: true });
    return;
  }
  try {
    for (const key of EDIT_ORDER_MODAL_FIELDS) {
      const value = interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '';
      saveTicketField(ticketId, key, value);
      if (key === 'deadline') updateTicketDeadline(ticketId, value);
    }
    const fields = getTicketFields(ticketId);
    const payload = getOrderSummaryPayload(fields, ticketId);
    await interaction.reply({ content: 'Order updated.', ephemeral: true });
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (channel) await channel.send(payload);
    logger.info('Order edited, summary re-posted', { ticketId });
  } catch (err) {
    logger.error('Edit order modal failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Failed to update order.', ephemeral: true }).catch(() => {});
  }
}
