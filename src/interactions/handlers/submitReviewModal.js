/**
 * Handler for submit_review_modal:ticketId — save review, post in CHANNEL_REVIEWS (STEP 10).
 */

import { randomBytes } from 'crypto';
import { run } from '../../core/Database.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { reviewEmbed } from '../../embeds/templates.js';
import { getSetting } from '../../core/GuildConfig.js';
import { logger } from '../../utils/logger.js';

export async function handleSubmitReviewModal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Ticket not found or you are not the client.', ephemeral: true });
    return;
  }
  const ratingStr = interaction.fields.getTextInputValue('review_rating')?.trim() || '0';
  const rating = parseInt(ratingStr, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    await interaction.reply({ content: 'Please enter a rating from 1 to 5.', ephemeral: true });
    return;
  }
  const comment = interaction.fields.getTextInputValue('review_comment')?.trim() || '';
  try {
    const reviewId = randomBytes(4).toString('hex');
    run(
      'INSERT INTO reviews (id, ticket_id, client_id, freelancer_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
      [reviewId, ticketId, ticket.client_id, ticket.assigned_freelancer_id || '', rating, comment]
    );
    let clientName = interaction.user.displayName || interaction.user.username || 'Client';
    let freelancerName = 'Freelancer';
    if (ticket.assigned_freelancer_id) {
      try {
        const u = await interaction.client.users.fetch(ticket.assigned_freelancer_id).catch(() => null);
        if (u) freelancerName = u.displayName || u.username || freelancerName;
      } catch (_) {}
    }
    const channelReviewsId = getSetting(interaction.guildId, 'channel_reviews');
    if (channelReviewsId) {
      const ch = await interaction.client.channels.fetch(channelReviewsId).catch(() => null);
      if (ch) {
        await ch.send({
          embeds: [reviewEmbed({ rating, comment }, clientName, freelancerName, ticketId)],
        });
      }
    }
    await interaction.reply({ content: 'Thank you for your review!', ephemeral: true });
    logger.info('Review submitted', { reviewId, ticketId });
  } catch (err) {
    logger.error('submit_review_modal failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Failed to submit review.', ephemeral: true }).catch(() => {});
  }
}
