/**
 * Handler for confirm_payment:ticketId — manager confirms payment (STEP 8). Manager only.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { STATUS, transitionTicket } from '../../modules/tickets/TicketStatus.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { run } from '../../core/Database.js';
import { markCompleteButtonRow } from '../../embeds/templates.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleConfirmPayment(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member;
  if (!member || !isManagerOrAdmin(member)) {
    await interaction.reply({ content: 'Only a manager or admin can confirm payment.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.client_channel_id || !ticket.assigned_freelancer_id) {
    await interaction.reply({ content: 'Ticket or freelancer not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  // assigned → paid; refused if already paid (double click) or not at that stage.
  if (!transitionTicket(ticketId, STATUS.PAID)) {
    await interaction.reply({ content: 'Payment is already confirmed, or the order is not at the payment stage.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    run('INSERT INTO action_log (ticket_id, actor_id, action, detail) VALUES (?, ?, ?, ?)', [
      ticketId,
      interaction.user.id,
      'confirm_payment',
      '',
    ]);
    // Answer first (the DB write above is done), then notify: the notifications below are several
    // round-trips to Discord and could otherwise blow the 3-second interaction window.
    await interaction.update({
      content: (interaction.message.content || '') + '\n\n✅ Payment confirmed.',
      components: [],
    });
    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (clientChannel) {
      await clientChannel.send('Payment has been confirmed. Your freelancer will begin work shortly.');
    }
    const freelancerChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    if (freelancerChannel) {
      await freelancerChannel.send('Payment has been confirmed. Client has paid; you may begin work.');
      await freelancerChannel.send({
        content: 'When work is done, mark the order complete:',
        components: [markCompleteButtonRow(ticketId)],
      });
    }
    const freelancerUser = await interaction.client.users.fetch(ticket.assigned_freelancer_id).catch(() => null);
    if (freelancerUser) {
      // DMs fail when the user has them closed — expected, not an error.
      await freelancerUser.send(`Payment confirmed for order \`${ticketId}\`. You may begin work.`).catch(() => {});
    }
    logger.info('Payment confirmed', { ticketId, managerId: interaction.user.id });
  } catch (err) {
    logger.error('confirm_payment failed', { ticketId, error: err.message });
    await replyError(interaction, 'Something went wrong.');
  }
}
