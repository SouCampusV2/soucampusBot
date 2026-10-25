/**
 * Handler for edit_order:ticketId — show Edit Order modal with pre-filled fields.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById, getTicketFields } from '../../modules/tickets/TicketRepository.js';
import { buildEditOrderModal } from '../../embeds/templates.js';
import { ensureTicketClient } from '../../utils/permissions.js';

export async function handleEditOrder(interaction, parts) {
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
  if (!(await ensureTicketClient(interaction, ticket))) return;
  const fields = getTicketFields(ticketId);
  const modal = buildEditOrderModal(ticketId, fields);
  await interaction.showModal(modal);
}
