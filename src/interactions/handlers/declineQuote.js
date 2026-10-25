/**
 * Handler for decline_quote:ticketId:proposalId:reason — client declines quote (price/portfolio/deadline). Client only.
 * Sends a message to the freelancer (quote) channel: who was declined, why, and quote details.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { getProposalById, declineProposal } from '../../modules/proposals/ProposalRepository.js';
import { DECLINE_REASON_LABELS, quoteDeclinedEmbed } from '../../embeds/templates.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleDeclineQuote(interaction, parts) {
  const ticketId = parts[1];
  const proposalId = parts[2];
  const reason = parts[3];
  if (!ticketId || !proposalId || !DECLINE_REASON_LABELS[reason]) {
    await interaction.reply({ content: 'Invalid data.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Only the order creator can use this button.', flags: MessageFlags.Ephemeral });
    return;
  }
  const proposal = getProposalById(proposalId);
  if (!proposal || proposal.ticket_id !== ticketId || proposal.status !== 'pending') {
    await interaction.reply({ content: 'Quote not found or already answered.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    declineProposal(proposalId, ticketId, interaction.user.id, reason);
    const label = DECLINE_REASON_LABELS[reason];
    await interaction.update({
      content: (interaction.message.content || 'Quote received.') + `\n\n❌ Declined (reason: ${label}).`,
      components: [],
      embeds: interaction.message.embeds,
    });
    const freelancerChannel = ticket.freelancer_channel_id
      ? await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null)
      : null;
    if (freelancerChannel) {
      let freelancerName = `<@${proposal.freelancer_id}>`;
      const member = await freelancerChannel.guild.members.fetch(proposal.freelancer_id).catch(() => null);
      if (member) freelancerName = member.displayName || member.user.username || freelancerName;
      await freelancerChannel
        .send({ content: `<@${proposal.freelancer_id}>`, embeds: [quoteDeclinedEmbed(proposal, freelancerName, label)] })
        .catch((err) => logger.warn('decline_quote: could not notify quote channel', { ticketId, error: err.message }));
    }
    logger.info('Quote declined by client', { proposalId, ticketId, reason });
  } catch (err) {
    logger.error('decline_quote failed', { ticketId, error: err.message });
    await replyError(interaction, 'Something went wrong.');
  }
}
