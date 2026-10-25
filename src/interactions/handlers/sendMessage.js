/**
 * Handler for send_message:ticketId — show modal to send message to client (STEP 6).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { buildSendMessageModal } from '../../embeds/templates.js';

export async function handleSendMessage(interaction, parts) {
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
  const modal = buildSendMessageModal(ticketId);
  await interaction.showModal(modal);
}
