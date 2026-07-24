/**
 * Handler for decline_quote:ticketId:proposalId:reason — client declines quote (price/portfolio/deadline). Client only.
 * Sends a message to the freelancer (quote) channel: who was declined, why, and quote details.
 */

import { EmbedBuilder } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { getProposalById, declineProposal } from '../../modules/proposals/ProposalRepository.js';
import { logger } from '../../utils/logger.js';

const REASON_LABELS = { price: 'цена', portfolio: 'портфолио', deadline: 'дедлайн' };

export async function handleDeclineQuote(interaction, parts) {
  const ticketId = parts[1];
  const proposalId = parts[2];
  const reason = parts[3];
  if (!ticketId || !proposalId || !reason || !['price', 'portfolio', 'deadline'].includes(reason)) {
    await interaction.reply({ content: 'Invalid data.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }
  if (ticket.client_id !== interaction.user.id) {
    await interaction.reply({ content: 'Only the order creator can use this button.', ephemeral: true });
    return;
  }
  const proposal = getProposalById(proposalId);
  if (!proposal || proposal.ticket_id !== ticketId || proposal.status !== 'pending') {
    await interaction.reply({ content: 'Quote not found or already answered.', ephemeral: true });
    return;
  }
  try {
    declineProposal(proposalId, ticketId, interaction.user.id, reason);
    const label = REASON_LABELS[reason] || reason;
    await interaction.update({
      content: (interaction.message.content || 'Quote received.') + `\n\n❌ Отклонено (причина: ${label}).`,
      components: [],
      embeds: interaction.message.embeds,
    });
    const freelancerChannel = ticket.freelancer_channel_id
      ? await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null)
      : null;
    if (freelancerChannel) {
      let freelancerName = `<@${proposal.freelancer_id}>`;
      try {
        const member = await freelancerChannel.guild.members.fetch(proposal.freelancer_id).catch(() => null);
        if (member) freelancerName = member.displayName || member.user.username || freelancerName;
      } catch (_) {}
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Квота отклонена клиентом')
        .setDescription(`Фрилансеру ${freelancerName} отказано. Причина: **${label}**.`)
        .addFields(
          { name: 'Цена', value: (proposal.price || '-').slice(0, 1024), inline: true },
          { name: 'Дедлайн', value: (proposal.deadline || '-').slice(0, 1024), inline: true },
          { name: 'Сообщение / портфолио', value: (proposal.message || '-').slice(0, 1024), inline: false }
        )
        .setTimestamp();
      await freelancerChannel.send({ content: `<@${proposal.freelancer_id}>`, embeds: [embed] }).catch(() => {});
    }
    logger.info('Quote declined by client', { proposalId, ticketId, reason });
  } catch (err) {
    logger.error('decline_quote failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
}
