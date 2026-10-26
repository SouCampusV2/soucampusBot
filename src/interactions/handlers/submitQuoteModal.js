/**
 * Handler for submit_quote_modal:ticketId — save proposal, post quote in freelancer channel and client channel with "Select this Freelancer" (STEP 5).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { createProposal, quoteRefusal } from '../../modules/proposals/ProposalRepository.js';
import { quoteEmbed, clientQuoteActionRows } from '../../embeds/templates.js';
import { refreshOrderCard } from '../../modules/tickets/OrderCard.js';
import { getFreelancerStats } from '../../modules/reviews/ReviewRepository.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleSubmitQuoteModal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.freelancer_channel_id || !ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channels not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  // Re-checked here: the order may have been assigned while the modal was open.
  const refusal = quoteRefusal(ticket, interaction.user.id);
  if (refusal) {
    await interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    const deadline = interaction.fields.getTextInputValue('quote_deadline')?.trim() || '';
    const price = interaction.fields.getTextInputValue('quote_price')?.trim() || '';
    const message = interaction.fields.getTextInputValue('quote_message')?.trim() || '';
    const freelancerId = interaction.user.id;
    const freelancerUsername = interaction.user.displayName || interaction.user.username || 'Freelancer';

    const { id: proposalId } = createProposal({ ticketId, freelancerId, price, deadline, message });
    // Saved; posting to two channels + the counter is slow — answer within Discord's 3 seconds first.
    await interaction.reply({ content: 'Your quote has been sent to the client.', flags: MessageFlags.Ephemeral });

    const stats = getFreelancerStats(freelancerId, ticket.guild_id);
    const embed = quoteEmbed({ price, deadline, message }, freelancerUsername, stats);
    const clientComponents = clientQuoteActionRows(ticketId, freelancerId, proposalId);

    const freelancerChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    if (freelancerChannel) {
      await freelancerChannel.send({ embeds: [embed] });
    }

    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (clientChannel) {
      await clientChannel.send({
        content:
          '💰 **New quote!** Compare it with the others — **Accept** it, ask first with **Contact freelancer**, ' +
          'or decline with a reason (the builder sees why).',
        embeds: [embed],
        components: clientComponents,
      });
    }
    await refreshOrderCard(interaction.client, ticketId);
    logger.info('Quote submitted and forwarded', { proposalId, ticketId, freelancerId });
  } catch (err) {
    logger.error('submit_quote_modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to submit quote.');
  }
}
