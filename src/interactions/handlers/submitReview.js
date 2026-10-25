/**
 * Handler for submit_review:ticketId — show review modal (STEP 10). Client only.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { getReviewByTicketId } from '../../modules/reviews/ReviewRepository.js';
import { buildSubmitReviewModal } from '../../embeds/templates.js';

export async function handleSubmitReview(interaction, parts) {
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
  if (ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Only the client can leave a review.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!ticket.completed) {
    await interaction.reply({ content: 'Order is not marked complete yet.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (getReviewByTicketId(ticketId)) {
    await interaction.reply({ content: 'You have already reviewed this order. Thank you!', flags: MessageFlags.Ephemeral });
    return;
  }
  const modal = buildSubmitReviewModal(ticketId);
  await interaction.showModal(modal);
}
