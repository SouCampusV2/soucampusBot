/**
 * Handler for submit_quote:ticketId — show Modal: Deadline, Price, Short message (STEP 5).
 */

import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { buildSubmitQuoteModal } from '../../embeds/templates.js';

export async function handleSubmitQuote(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }
  const modal = buildSubmitQuoteModal(ticketId);
  await interaction.showModal(modal);
}
