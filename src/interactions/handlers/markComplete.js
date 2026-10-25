/**
 * Handler for mark_complete:ticketId — manager marks order complete (STEP 10). Sends "Leave Review" to client channel.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { STATUS, transitionTicket } from '../../modules/tickets/TicketStatus.js';
import { isManagerOrAdmin, getFreelancerRole } from '../../utils/permissions.js';
import { getSetting } from '../../core/GuildConfig.js';
import { leaveReviewButtonRow } from '../../embeds/templates.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleMarkComplete(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member;
  if (!member || !isManagerOrAdmin(member)) {
    await interaction.reply({ content: 'Only a manager or admin can mark the order complete.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channel not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  // paid → completed; refused if already complete or payment not confirmed yet.
  if (!transitionTicket(ticketId, STATUS.COMPLETED)) {
    await interaction.reply({ content: 'Order is already complete, or payment has not been confirmed yet.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    // Answer first, then do the slow channel work (see confirmPayment.js for why).
    await interaction.update({
      content: (interaction.message.content || '') + '\n\n✅ Marked complete.',
      components: [],
    });
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
        if (archiveCategory) {
          // lockPermissions: false — keep this channel's own overwrites instead of syncing to the category.
          await fc.setParent(archiveCategory, { lockPermissions: false }).catch((err) =>
            logger.warn('mark_complete: could not move quote channel', { ticketId, error: err.message })
          );
        }
        // Read-only means read-only for every overwrite that allowed writing: @everyone AND the
        // Freelancer role (its overwrite explicitly allows SendMessages, so @everyone alone is not enough).
        const lockTargets = [fc.guild.id, getFreelancerRole(fc.guild)?.id].filter(Boolean);
        for (const target of lockTargets) {
          await fc.permissionOverwrites.edit(target, { SendMessages: false }).catch((err) =>
            logger.warn('mark_complete: could not lock quote channel', { ticketId, target, error: err.message })
          );
        }
      }
    }
    logger.info('Order marked complete', { ticketId });
  } catch (err) {
    logger.error('mark_complete failed', { ticketId, error: err.message });
    await replyError(interaction, 'Something went wrong.');
  }
}
