/**
 * Handler for contact_freelancer:ticketId:freelancerId — create discussion THREAD in client channel (client only). Thread = client + freelancer + managers.
 */

import { ChannelType } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { closeDiscussionButtonRow } from '../../embeds/templates.js';
import { logger } from '../../utils/logger.js';

export async function handleContactFreelancer(interaction, parts) {
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
    await interaction.reply({ content: 'Only the order creator can use this button.', ephemeral: true });
    return;
  }
  const clientChannel = ticket.client_channel_id
    ? await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null)
    : null;
  if (!clientChannel?.guild) {
    await interaction.reply({ content: 'Order channel not found.', ephemeral: true });
    return;
  }
  try {
    const threadName = `discussion-${ticketId}`.slice(0, 100);
    const thread = await clientChannel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      reason: 'Discussion with freelancer',
    });
    await thread.members.add(freelancerId).catch(() => {});
    const row = closeDiscussionButtonRow(ticketId, thread.id);
    await thread.send({
      content: `Discussion. Client <@${ticket.client_id}> and freelancer <@${freelancerId}> can talk here.`,
      components: [row],
    });
    await interaction.reply({
      content: `Created discussion thread: <#${thread.id}>`,
      ephemeral: true,
    });
    logger.info('Discussion thread created', { ticketId, threadId: thread.id, clientId: ticket.client_id, freelancerId });
  } catch (err) {
    logger.error('contact_freelancer failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Failed to create discussion thread.', ephemeral: true }).catch(() => {});
  }
}
