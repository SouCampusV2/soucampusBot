/**
 * Handler for reply_relay:conversationId — Reply on a conversation card: the client, the builder
 * of this conversation, or a manager. Cards from before 2026-10-26 carry a ticket id instead.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { getConversation } from '../../modules/conversations/ConversationRepository.js';
import { speakerRole } from '../../modules/conversations/Conversation.js';
import { buildReplyRelayModal } from '../../embeds/templates.js';

export const OLD_RELAY_TEXT = 'This message is from an older version of the bot — ask the builder to use **Send Message** again.';

export async function handleReplyRelay(interaction, parts) {
  const conversation = /^\d+$/.test(parts[1] ?? '') ? getConversation(parts[1]) : undefined;
  if (!conversation) {
    await interaction.reply({ content: OLD_RELAY_TEXT, flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(conversation.ticket_id);
  if (!speakerRole(interaction.member, ticket, conversation)) {
    await interaction.reply({ content: 'Only the client and this builder can reply here.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(buildReplyRelayModal(conversation.id));
}
