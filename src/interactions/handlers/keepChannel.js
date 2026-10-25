/**
 * Handler for keep_channel:ticketId — manager keeps a closed ticket's channel archived
 * instead of letting the cleanup job delete it.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById, setChannelDeleteAt } from '../../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { logger } from '../../utils/logger.js';

export async function handleKeepChannel(interaction, parts) {
  const ticketId = parts[1];
  const ticket = ticketId ? getTicketById(ticketId) : undefined;
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isManagerOrAdmin(interaction.member)) {
    await interaction.reply({ content: 'Only a manager can keep a closed ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  setChannelDeleteAt(ticketId, null);
  await interaction.update({
    content: `🔒 Ticket closed. Kept archived by <@${interaction.user.id}> — this channel will not be deleted.`,
    components: [],
  });
  logger.info('Closed ticket kept archived', { ticketId, by: interaction.user.id });
}
