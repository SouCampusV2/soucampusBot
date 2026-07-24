/**
 * Handler for select_freelancer:ticketId:freelancerId — client confirms; assign freelancer to ticket (STEP 5).
 * Adds freelancer to client (order) channel so they share one chat.
 */

import { PermissionFlagsBits } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { getProposalsByTicketId } from '../../modules/proposals/ProposalRepository.js';
import { acceptProposal } from '../../modules/proposals/ProposalRepository.js';
import { confirmPaymentButtonRow } from '../../embeds/templates.js';
import { logger } from '../../utils/logger.js';

export async function handleSelectFreelancer(interaction, parts) {
  const ticketId = parts[1];
  const freelancerId = parts[2];
  if (!ticketId || !freelancerId) {
    await interaction.reply({ content: 'Invalid data.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }
  if (ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Only the client can select a freelancer.', ephemeral: true });
    return;
  }
  if (ticket.assigned_freelancer_id) {
    await interaction.reply({ content: 'A freelancer has already been selected for this order.', ephemeral: true });
    return;
  }
  const proposals = getProposalsByTicketId(ticketId);
  const proposal = proposals.find((p) => p.freelancer_id === freelancerId && p.status === 'pending');
  if (!proposal) {
    await interaction.reply({ content: 'Quote not found or already accepted.', ephemeral: true });
    return;
  }
  try {
    acceptProposal(proposal.id, ticketId, freelancerId);
    const clientChannel = ticket.client_channel_id
      ? await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null)
      : null;
    if (clientChannel) {
      await clientChannel.permissionOverwrites.edit(freelancerId, {
        ViewChannel: true,
        SendMessages: true,
      });
    }
    const freelancerChannel = ticket.freelancer_channel_id
      ? await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null)
      : null;
    if (freelancerChannel) {
      await freelancerChannel.send({
        content: 'Manager: confirm when payment is received from the client.',
        components: [confirmPaymentButtonRow(ticketId)],
      });
    }
    await interaction.update({
      content: `✅ Freelancer <@${freelancerId}> has been assigned to your order.`,
      components: [],
      embeds: interaction.message.embeds,
    });
    logger.info('Freelancer selected', { ticketId, freelancerId });
  } catch (err) {
    logger.error('select_freelancer failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
}
