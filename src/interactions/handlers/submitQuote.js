/**
 * Handler for submit_quote:ticketId — show Modal: Deadline, Price, Short message (STEP 5).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { quoteRefusal } from '../../modules/proposals/ProposalRepository.js';
import { buildSubmitQuoteModal } from '../../embeds/templates.js';

export async function handleSubmitQuote(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  const refusal = quoteRefusal(ticket, interaction.user.id);
  if (refusal) {
    await interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
    return;
  }
  const modal = buildSubmitQuoteModal(ticketId);
  await interaction.showModal(modal);
}
