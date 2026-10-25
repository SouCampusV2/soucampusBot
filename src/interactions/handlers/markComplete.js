/**
 * Handler for mark_complete:ticketId — manager marks order complete (STEP 10). Sends "Leave Review" to client channel.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { STATUS, transitionTicket } from '../../modules/tickets/TicketStatus.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { archiveQuoteChannel } from '../../utils/channels.js';
import { leaveReviewButtonRow, closeTicketButtonRow, siteConsentPayload } from '../../embeds/templates.js';
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
        content: 'Your order is complete! Please leave a review. When you are done, you can close the ticket.',
        components: [leaveReviewButtonRow(ticketId), closeTicketButtonRow(ticketId)],
      });
      await clientChannel.send(siteConsentPayload(ticketId, 'portfolio'));
    }
    if (ticket.freelancer_channel_id) {
      const fc = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
      if (fc) {
        await fc.send('This order has been marked complete. The client will be asked to leave a review.');
        await archiveQuoteChannel(fc, { ticketId });
      }
    }
    logger.info('Order marked complete', { ticketId });
  } catch (err) {
    logger.error('mark_complete failed', { ticketId, error: err.message });
    await replyError(interaction, 'Something went wrong.');
  }
}
