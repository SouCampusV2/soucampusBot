/**
 * Handler for submit_review_modal:ticketId — save review, post in the reviews channel (STEP 10).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { STATUS } from '../../modules/tickets/TicketStatus.js';
import { getReviewByTicketId, createReview } from '../../modules/reviews/ReviewRepository.js';
import { reviewEmbed, siteConsentPayload } from '../../embeds/templates.js';
import { getSetting } from '../../core/GuildConfig.js';
import { ticketEvents } from '../../modules/tickets/events.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleSubmitReviewModal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Ticket not found or you are not the client.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.status !== STATUS.COMPLETED) {
    await interaction.reply({ content: 'Order is not marked complete yet.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ratingStr = interaction.fields.getTextInputValue('review_rating')?.trim() || '0';
  const rating = parseInt(ratingStr, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    await interaction.reply({ content: 'Please enter a rating from 1 to 5.', flags: MessageFlags.Ephemeral });
    return;
  }
  // Check and insert stay in one synchronous block (no await between them), so a
  // double submit cannot slip a second review in — see docs/ARCHITECTURE.md → "Races".
  if (getReviewByTicketId(ticketId)) {
    await interaction.reply({ content: 'You have already reviewed this order. Thank you!', flags: MessageFlags.Ephemeral });
    return;
  }
  const comment = interaction.fields.getTextInputValue('review_comment')?.trim() || '';
  try {
    const { id: reviewId } = createReview({
      ticketId,
      clientId: ticket.client_id,
      freelancerId: ticket.assigned_freelancer_id || '',
      rating,
      comment,
    });
    const clientName = interaction.user.displayName || interaction.user.username || 'Client';
    let freelancerName = 'Freelancer';
    if (ticket.assigned_freelancer_id) {
      const u = await interaction.client.users.fetch(ticket.assigned_freelancer_id).catch(() => null);
      if (u) freelancerName = u.displayName || u.username || freelancerName;
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
    await interaction.reply({ content: 'Thank you for your review!', flags: MessageFlags.Ephemeral });
    ticketEvents.emit('review', { ticketId, guildId: ticket.guild_id, rating });
    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    await clientChannel?.send(siteConsentPayload(ticketId, 'review'));
    logger.info('Review submitted', { reviewId, ticketId });
  } catch (err) {
    logger.error('submit_review_modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to submit review.');
  }
}
