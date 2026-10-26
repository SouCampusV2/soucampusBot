/**
 * Handler for contact_freelancer:ticketId:freelancerId — create discussion THREAD in client channel (client only). Thread = client + freelancer + managers.
 */

import { ChannelType, MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { findBuilderThreadId, rememberBuilderThread } from '../../modules/conversations/ConversationRepository.js';
import { closeDiscussionButtonRow, ticketLabel } from '../../embeds/templates.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleContactFreelancer(interaction, parts) {
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
    await interaction.reply({ content: 'Only the order creator can use this button.', flags: MessageFlags.Ephemeral });
    return;
  }
  const clientChannel = ticket.client_channel_id
    ? await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null)
    : null;
  if (!clientChannel?.guild) {
    await interaction.reply({ content: 'Order channel not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    // Thread creation + adding a member + a message: can exceed the 3-second answer window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // One thread per builder: a second press leads to the one already open.
    const threadId = findBuilderThreadId(ticketId, freelancerId);
    const existing = threadId ? await interaction.client.channels.fetch(threadId).catch(() => null) : null;
    if (existing) {
      if (existing.archived) await existing.setArchived(false);
      await interaction.editReply({ content: `Your thread with this builder: <#${existing.id}>` });
      return;
    }
    const threadName = `talk-${ticket.number ?? ticketId}-${freelancerId.slice(-4)}`.slice(0, 100);
    const thread = await clientChannel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      reason: 'Discussion with freelancer',
    });
    await thread.members.add(freelancerId).catch((err) =>
      logger.warn('contact_freelancer: could not add freelancer to thread', { ticketId, error: err.message })
    );
    const row = closeDiscussionButtonRow(ticketId, thread.id);
    await thread.send({
      content:
        `🔒 Private thread for order ${ticketLabel(ticket)}: <@${ticket.client_id}> and <@${freelancerId}> can talk here freely. Close it when you are done.`,
      components: [row],
    });
    rememberBuilderThread(ticketId, freelancerId, thread.id);
    await interaction.editReply({ content: `Created a private thread: <#${thread.id}>` });
    logger.info('Discussion thread created', { ticketId, threadId: thread.id, clientId: ticket.client_id, freelancerId });
  } catch (err) {
    logger.error('contact_freelancer failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to create discussion thread.');
  }
}
