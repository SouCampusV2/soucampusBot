/**
 * Handler for extend_deadline:ticketId — manager opens modal to set new deadline (STEP 9).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { buildExtendDeadlineModal } from '../../embeds/templates.js';

export async function handleExtendDeadline(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member;
  if (!member || !isManagerOrAdmin(member)) {
    await interaction.reply({ content: 'Only a manager or admin can extend the deadline.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  const modal = buildExtendDeadlineModal(ticketId, ticket.deadline || '');
  await interaction.showModal(modal);
}
