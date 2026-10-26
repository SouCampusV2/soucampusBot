/**
 * Handler for send_message:ticketId — a builder in the quote channel opens the message modal (STEP 6).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { startRefusal } from '../../modules/conversations/Conversation.js';
import { buildSendMessageModal } from '../../embeds/templates.js';

export async function handleSendMessage(interaction, parts) {
  const ticket = parts[1] ? getTicketById(parts[1]) : undefined;
  const refusal = startRefusal(interaction.member, ticket);
  if (refusal) {
    await interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.showModal(buildSendMessageModal(ticket.id));
}
