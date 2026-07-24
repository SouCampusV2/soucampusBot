/**
 * Handler for confirm_payment:ticketId — manager confirms payment (STEP 8). Manager only.
 */

import { getTicketById, setPaymentConfirmed } from '../../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { run } from '../../core/Database.js';
import { markCompleteButtonRow } from '../../embeds/templates.js';
import { logger } from '../../utils/logger.js';

export async function handleConfirmPayment(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const member = interaction.member;
  if (!member || !isManagerOrAdmin(member)) {
    await interaction.reply({ content: 'Only a manager or admin can confirm payment.', ephemeral: true });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.client_channel_id || !ticket.assigned_freelancer_id) {
    await interaction.reply({ content: 'Ticket or freelancer not found.', ephemeral: true });
    return;
  }
  if (ticket.payment_confirmed) {
    await interaction.reply({ content: 'Payment already confirmed for this order.', ephemeral: true });
    return;
  }
  try {
    setPaymentConfirmed(ticketId);
    run('INSERT INTO action_log (ticket_id, actor_id, action, detail) VALUES (?, ?, ?, ?)', [
      ticketId,
      interaction.user.id,
      'confirm_payment',
      '',
    ]);
    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (clientChannel) {
      await clientChannel.send('Payment has been confirmed. Your freelancer will begin work shortly.');
    }
    const freelancerChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    if (freelancerChannel) {
      await freelancerChannel.send('Payment has been confirmed. Client has paid; you may begin work.').catch(() => {});
    }
    const freelancerUser = await interaction.client.users.fetch(ticket.assigned_freelancer_id).catch(() => null);
    if (freelancerUser) {
      await freelancerUser.send(`Payment confirmed for order \`${ticketId}\`. You may begin work.`).catch(() => {});
    }
    await interaction.update({
      content: (interaction.message.content || '') + '\n\n✅ Payment confirmed.',
      components: [],
    });
    const freelancerCh = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    if (freelancerCh) {
      await freelancerCh.send({ content: 'When work is done, mark the order complete:', components: [markCompleteButtonRow(ticketId)] }).catch(() => {});
    }
    logger.info('Payment confirmed', { ticketId, managerId: interaction.user.id });
  } catch (err) {
    logger.error('confirm_payment failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
}
