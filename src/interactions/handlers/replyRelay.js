/**
 * Handler for reply_relay:ticketId — show Reply modal (client or freelancer). STEP 6.
 */

import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { buildReplyRelayModal } from '../../embeds/templates.js';

export async function handleReplyRelay(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.freelancer_channel_id || !ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channels not found.', ephemeral: true });
    return;
  }
  const modal = buildReplyRelayModal(ticketId);
  await interaction.showModal(modal);
}
