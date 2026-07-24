/**
 * Handler for submit_quote_modal:ticketId — save proposal, post quote in freelancer channel and client channel with "Select this Freelancer" (STEP 5).
 */

import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { createProposal } from '../../modules/proposals/ProposalRepository.js';
import { quoteEmbed, clientQuoteActionRows } from '../../embeds/templates.js';
import { logger } from '../../utils/logger.js';

export async function handleSubmitQuoteModal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.freelancer_channel_id || !ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channels not found.', ephemeral: true });
    return;
  }
  try {
    const deadline = interaction.fields.getTextInputValue('quote_deadline')?.trim() || '';
    const price = interaction.fields.getTextInputValue('quote_price')?.trim() || '';
    const message = interaction.fields.getTextInputValue('quote_message')?.trim() || '';
    const freelancerId = interaction.user.id;
    const freelancerUsername = interaction.user.displayName || interaction.user.username || 'Freelancer';

    const { id: proposalId } = createProposal({ ticketId, freelancerId, price, deadline, message });

    const embed = quoteEmbed({ price, deadline, message }, freelancerUsername);
    const clientComponents = clientQuoteActionRows(ticketId, freelancerId, proposalId);

    const freelancerChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    if (freelancerChannel) {
      await freelancerChannel.send({ embeds: [embed] });
    }

    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (clientChannel) {
      await clientChannel.send({
        content: 'New quote received (only order creator can use buttons):',
        embeds: [embed],
        components: clientComponents,
      });
    }

    await interaction.reply({ content: 'Your quote has been sent to the client.', ephemeral: true });
    logger.info('Quote submitted and forwarded', { proposalId, ticketId, freelancerId });
  } catch (err) {
    logger.error('submit_quote_modal failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Failed to submit quote.', ephemeral: true }).catch(() => {});
  }
}
