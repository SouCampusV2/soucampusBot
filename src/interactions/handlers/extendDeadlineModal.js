/**
 * Handler for extend_deadline_modal:ticketId — update deadline, post in client + freelancer channel (STEP 9).
 */

import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { updateTicketDeadline } from '../../modules/tickets/TicketRepository.js';
import { logger } from '../../utils/logger.js';

export async function handleExtendDeadlineModal(interaction, parts) {
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
  const newDeadline = interaction.fields.getTextInputValue('new_deadline')?.trim() || '';
  if (!newDeadline) {
    await interaction.reply({ content: 'Please enter a deadline.', ephemeral: true });
    return;
  }
  try {
    updateTicketDeadline(ticketId, newDeadline);
    const msg = `📅 **Deadline updated** to: ${newDeadline}`;
    if (ticket.client_channel_id) {
      const ch = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
      if (ch) await ch.send(msg).catch(() => {});
    }
    if (ticket.freelancer_channel_id) {
      const ch = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
      if (ch) await ch.send(msg).catch(() => {});
    }
    await interaction.reply({ content: 'Deadline updated.', ephemeral: true });
    logger.info('Deadline extended', { ticketId, newDeadline });
  } catch (err) {
    logger.error('extend_deadline_modal failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Failed to update deadline.', ephemeral: true }).catch(() => {});
  }
}
