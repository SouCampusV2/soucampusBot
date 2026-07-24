/**
 * Handler for decline_order:ticketId — remove freelancer's view of channel, send DM (STEP 7).
 */

import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { logger } from '../../utils/logger.js';

export async function handleDeclineOrder(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  const channel = interaction.channel;
  if (!ticket || ticket.freelancer_channel_id !== channel?.id) {
    await interaction.reply({ content: 'Wrong channel.', ephemeral: true });
    return;
  }
  try {
    // Explicitly deny ViewChannel so user loses access even if they are channel creator or have role-based access
    await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: false });
    const clientName = 'the client';
    try {
      const member = await interaction.guild.members.fetch(ticket.client_id).catch(() => null);
      if (member) clientName = member.displayName || member.user.username || clientName;
    } catch (_) {}
    await interaction.user.send(
      `You've declined the order from ${clientName}. You will no longer see this listing.`
    ).catch(() => {});
    await interaction.reply({ content: 'You have been removed from this listing.', ephemeral: true });
    logger.info('Freelancer declined order', { ticketId, userId: interaction.user.id });
  } catch (err) {
    logger.error('decline_order failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
}
