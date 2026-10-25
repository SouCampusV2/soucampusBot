/**
 * Handler for send_message_modal:ticketId — post freelancer message in both channels with Reply button (STEP 6).
 * Stores message IDs so replies appear under the original message (Discord reply reference).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { relayMessageEmbed, replyRelayButtonRow } from '../../embeds/templates.js';
import { setRelayMessageIds } from '../../utils/relayMessageStore.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleSendMessageModal(interaction, parts) {
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
  const content = interaction.fields.getTextInputValue('relay_message')?.trim() || '';
  if (!content) {
    await interaction.reply({ content: 'Message cannot be empty.', flags: MessageFlags.Ephemeral });
    return;
  }
  const authorName = interaction.user.displayName || interaction.user.username || 'Freelancer';
  const embed = relayMessageEmbed(authorName, content);
  const row = replyRelayButtonRow(ticketId);
  const opts = { embeds: [embed], components: [row] };
  try {
    const freelancerChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    let msgClient = null;
    let msgFreelancer = null;
    if (clientChannel) msgClient = await clientChannel.send(opts);
    if (freelancerChannel) msgFreelancer = await freelancerChannel.send(opts);
    if (msgClient?.id && msgFreelancer?.id) {
      setRelayMessageIds(ticketId, { clientMsgId: msgClient.id, freelancerMsgId: msgFreelancer.id });
    }
    await interaction.reply({ content: 'Message sent to client.', flags: MessageFlags.Ephemeral });
    logger.info('Relay message sent', { ticketId, from: interaction.user.id });
  } catch (err) {
    logger.error('send_message_modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to send message.');
  }
}
