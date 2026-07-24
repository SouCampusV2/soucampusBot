/**
 * Handler for mark_complete:ticketId — manager marks order complete (STEP 10). Sends "Leave Review" to client channel.
 */

import { getTicketById, setTicketCompleted } from '../../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { getSetting } from '../../core/GuildConfig.js';
import { leaveReviewButtonRow } from '../../embeds/templates.js';
import { logger } from '../../utils/logger.js';

export async function handleMarkComplete(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const member = interaction.member;
  if (!member || !isManagerOrAdmin(member)) {
    await interaction.reply({ content: 'Only a manager or admin can mark the order complete.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channel not found.', ephemeral: true });
    return;
  }
  if (ticket.completed) {
    await interaction.reply({ content: 'Order is already marked complete.', ephemeral: true });
    return;
  }
  try {
    setTicketCompleted(ticketId);
    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (clientChannel) {
      await clientChannel.send({
        content: 'Your order is complete! Please leave a review.',
        components: [leaveReviewButtonRow(ticketId)],
      });
    }
    if (ticket.freelancer_channel_id) {
      const fc = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
      if (fc) {
        await fc.send('This order has been marked complete. The client will be asked to leave a review.');
        const archiveCategory = getSetting(fc.guild.id, 'category_archived');
        await fc.setParent(archiveCategory || null).catch(() => {});
        await fc.permissionOverwrites.edit(fc.guild.id, { SendMessages: false }).catch(() => {});
      }
    }
    await interaction.update({
      content: (interaction.message.content || '') + '\n\n✅ Marked complete.',
      components: [],
    });
    logger.info('Order marked complete', { ticketId });
  } catch (err) {
    logger.error('mark_complete failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
}
