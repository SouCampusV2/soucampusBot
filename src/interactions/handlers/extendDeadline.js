/**
 * Handler for extend_deadline:ticketId — manager opens modal to set new deadline (STEP 9).
 */

import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { buildExtendDeadlineModal } from '../../embeds/templates.js';

export async function handleExtendDeadline(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const member = interaction.member;
  if (!member || !isManagerOrAdmin(member)) {
    await interaction.reply({ content: 'Only a manager or admin can extend the deadline.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }
  const modal = buildExtendDeadlineModal(ticketId, ticket.deadline || '');
  await interaction.showModal(modal);
}
