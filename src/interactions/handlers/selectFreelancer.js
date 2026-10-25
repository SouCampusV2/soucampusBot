/**
 * Handler for select_freelancer:ticketId:freelancerId — client confirms; assign freelancer to ticket (STEP 5).
 * Adds freelancer to client (order) channel so they share one chat.
 */

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { getProposalsByTicketId, acceptProposal } from '../../modules/proposals/ProposalRepository.js';
import { confirmPaymentButtonRow } from '../../embeds/templates.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleSelectFreelancer(interaction, parts) {
  const ticketId = parts[1];
  const freelancerId = parts[2];
  if (!ticketId || !freelancerId) {
    await interaction.reply({ content: 'Invalid data.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Only the client can select a freelancer.', flags: MessageFlags.Ephemeral });
    return;
  }
  const proposals = getProposalsByTicketId(ticketId);
  const proposal = proposals.find((p) => p.freelancer_id === freelancerId && p.status === 'pending');
  if (!proposal) {
    await interaction.reply({ content: 'Quote not found or already answered.', flags: MessageFlags.Ephemeral });
    return;
  }
  // acceptProposal moves the ticket open → assigned; false means the order is not open anymore.
  if (!acceptProposal(proposal.id, ticketId, freelancerId)) {
    await interaction.reply({ content: 'A freelancer has already been selected for this order.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    // Answer first, then do the slow channel work (see confirmPayment.js for why).
    await interaction.update({
      content: `✅ Freelancer <@${freelancerId}> has been assigned to your order.`,
      components: [],
      embeds: interaction.message.embeds,
    });
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
    logger.info('Freelancer selected', { ticketId, freelancerId });
  } catch (err) {
    logger.error('select_freelancer failed', { ticketId, error: err.message });
    await replyError(interaction, 'Something went wrong.');
  }
}
