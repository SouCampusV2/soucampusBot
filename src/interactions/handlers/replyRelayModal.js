/**
 * Handler for reply_relay_modal:conversationId — the reply is added to the same conversation
 * card (client channel and quote channel), not posted as a new message (STEP 6).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { STATUS } from '../../modules/tickets/TicketStatus.js';
import { getConversation } from '../../modules/conversations/ConversationRepository.js';
import { speakerRole, postConversationMessage } from '../../modules/conversations/Conversation.js';
import { OLD_RELAY_TEXT } from './replyRelay.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleReplyRelayModal(interaction, parts) {
  const conversation = /^\d+$/.test(parts[1] ?? '') ? getConversation(parts[1]) : undefined;
  if (!conversation) {
    await interaction.reply({ content: OLD_RELAY_TEXT, flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(conversation.ticket_id);
  // A modal is its own door: re-check who submits it.
  const role = speakerRole(interaction.member, ticket, conversation);
  if (!role) {
    await interaction.reply({ content: 'Only the client and this builder can reply here.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.status === STATUS.CLOSED) {
    await interaction.reply({ content: 'This order is closed.', flags: MessageFlags.Ephemeral });
    return;
  }
  const content = interaction.fields.getTextInputValue('message')?.trim() || '';
  if (!content) {
    await interaction.reply({ content: 'Reply cannot be empty.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await postConversationMessage(interaction.client, conversation.id, {
      authorId: interaction.user.id,
      authorName: interaction.member?.displayName || interaction.user.displayName || interaction.user.username,
      authorRole: role,
      content,
    });
    await interaction.editReply({ content: '✅ Added to the conversation.' });
    logger.info('Conversation reply', { ticketId: ticket.id, conversationId: conversation.id, role });
  } catch (err) {
    logger.error('reply_relay_modal failed', { conversationId: conversation.id, error: err.message });
    await replyError(interaction, 'Failed to send the reply.');
  }
}
