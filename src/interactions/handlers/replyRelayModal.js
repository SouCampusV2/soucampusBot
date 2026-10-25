/**
 * Handler for reply_relay_modal:ticketId — post reply UNDER the original message in both channels (Discord reply reference). STEP 6.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { relayMessageEmbed, replyRelayButtonRow } from '../../embeds/templates.js';
import { getRelayMessageIds, setRelayMessageIds } from '../../utils/relayMessageStore.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleReplyRelayModal(interaction, parts) {
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
  const content = interaction.fields.getTextInputValue('reply_text')?.trim() || '';
  if (!content) {
    await interaction.reply({ content: 'Reply cannot be empty.', flags: MessageFlags.Ephemeral });
    return;
  }
  const isClient = interaction.user.id === ticket.client_id;
  const authorName = isClient ? 'Client' : (interaction.user.displayName || interaction.user.username || 'Freelancer');
  const embed = relayMessageEmbed(authorName, content);
  const row = replyRelayButtonRow(ticketId);
  const ids = getRelayMessageIds(ticketId);
  try {
    const freelancerChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    const baseOpts = { embeds: [embed], components: [row] };
    const clientOpts = ids?.clientMsgId
      ? { ...baseOpts, reply: { messageReference: ids.clientMsgId } }
      : baseOpts;
    const freelancerOpts = ids?.freelancerMsgId
      ? { ...baseOpts, reply: { messageReference: ids.freelancerMsgId } }
      : baseOpts;
    let msgClient = null;
    let msgFreelancer = null;
    if (clientChannel) msgClient = await clientChannel.send(clientOpts);
    if (freelancerChannel) msgFreelancer = await freelancerChannel.send(freelancerOpts);
    if (msgClient?.id && msgFreelancer?.id) {
      setRelayMessageIds(ticketId, { clientMsgId: msgClient.id, freelancerMsgId: msgFreelancer.id });
    }
    await interaction.reply({ content: 'Reply sent.', flags: MessageFlags.Ephemeral });
    logger.info('Relay reply sent', { ticketId, from: interaction.user.id });
  } catch (err) {
    logger.error('reply_relay_modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to send reply.');
  }
}
