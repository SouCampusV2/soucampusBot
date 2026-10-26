/**
 * Handler for send_message_modal:ticketId — every Send Message is a new conversation card: one
 * in the client channel and its copy in the quote channel; Reply adds to that card (STEP 6,
 * modules/conversations/Conversation.js).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { createConversation } from '../../modules/conversations/ConversationRepository.js';
import { startRefusal, postConversationMessage } from '../../modules/conversations/Conversation.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleSendMessageModal(interaction, parts) {
  const ticket = parts[1] ? getTicketById(parts[1]) : undefined;
  // A modal is its own door: re-check, the order may have been taken while it was open.
  const refusal = startRefusal(interaction.member, ticket);
  if (refusal) {
    await interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
    return;
  }
  const content = interaction.fields.getTextInputValue('message')?.trim() || '';
  if (!content) {
    await interaction.reply({ content: 'Message cannot be empty.', flags: MessageFlags.Ephemeral });
    return;
  }
  const conversation = createConversation(ticket.id, interaction.user.id);
  try {
    // Two cards to post or edit + a DM: well over Discord's 3 seconds.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await postConversationMessage(interaction.client, conversation.id, {
      authorId: interaction.user.id,
      authorName: interaction.member?.displayName || interaction.user.displayName || interaction.user.username,
      authorRole: 'builder',
      content,
    });
    await interaction.editReply({ content: '✅ Sent. The client sees it in their ticket; their answer appears on this card in the quote channel.' });
    logger.info('Conversation message from builder', { ticketId: ticket.id, conversationId: conversation.id });
  } catch (err) {
    logger.error('send_message_modal failed', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'Failed to send the message.');
  }
}
