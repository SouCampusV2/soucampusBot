/**
 * Handler for decline_order:ticketId — remove freelancer's view of channel, send DM, update the
 * client's order card (STEP 7).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { refreshOrderCard } from '../../modules/tickets/OrderCard.js';
import { run } from '../../core/Database.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleDeclineOrder(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  const channel = interaction.channel;
  if (!ticket || ticket.freelancer_channel_id !== channel?.id) {
    await interaction.reply({ content: 'Wrong channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    // The counter reads this log (distinct freelancers), so a double click still counts once.
    run('INSERT INTO action_log (ticket_id, actor_id, action, detail) VALUES (?, ?, ?, ?)', [
      ticketId,
      interaction.user.id,
      'decline_order',
      '',
    ]);
    await interaction.reply({ content: 'You have been removed from this listing.', flags: MessageFlags.Ephemeral });
    // Explicitly deny ViewChannel so user loses access even if they are channel creator or have role-based access
    await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: false });
    let clientName = 'the client';
    const member = await interaction.guild.members.fetch(ticket.client_id).catch(() => null);
    if (member) clientName = member.displayName || member.user.username || clientName;
    // DMs fail when the user has them closed — expected, not an error.
    await interaction.user.send(`You've declined the order from ${clientName}. You will no longer see this listing.`).catch(() => {});
    await refreshOrderCard(interaction.client, ticketId);
    logger.info('Freelancer declined order', { ticketId, userId: interaction.user.id });
  } catch (err) {
    logger.error('decline_order failed', { ticketId, error: err.message });
    await replyError(interaction, 'Something went wrong.');
  }
}
