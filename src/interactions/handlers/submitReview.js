/**
 * Handler for submit_review:ticketId — show review modal (STEP 10). Client only.
 */

import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { buildSubmitReviewModal } from '../../embeds/templates.js';

export async function handleSubmitReview(interaction, parts) {
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
  if (ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Only the client can leave a review.', ephemeral: true });
    return;
  }
  if (!ticket.completed) {
    await interaction.reply({ content: 'Order is not marked complete yet.', ephemeral: true });
    return;
  }
  const modal = buildSubmitReviewModal(ticketId);
  await interaction.showModal(modal);
}
