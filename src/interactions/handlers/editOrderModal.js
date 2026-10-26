/**
 * Handler for edit_order_modal:ticketId — modal submit: update ticket_fields and re-post order summary.
 */

import { MessageFlags } from 'discord.js';
import {
  getTicketById,
  getTicketFields,
  saveTicketField,
  updateTicketDeadline,
} from '../../modules/tickets/TicketRepository.js';
import {
  getOrderSummaryPayload,
  orderSummaryEmbedForFreelancers,
  EDIT_ORDER_MODAL_FIELDS,
  EDIT_CLOSED_TEXT,
  deadlineWarning,
} from '../../embeds/templates.js';
import { STATUS } from '../../modules/tickets/TicketStatus.js';
import { ensureTicketClient } from '../../utils/permissions.js';
import { refreshOrderCard } from '../../modules/tickets/OrderCard.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleEditOrderModal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channel not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  // A modal is its own door: re-check who submits it, the check on the button does not carry over.
  if (!(await ensureTicketClient(interaction, ticket))) return;
  if (![STATUS.FORM, STATUS.OPEN].includes(ticket.status)) {
    await interaction.reply({ content: EDIT_CLOSED_TEXT, flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    let warning = '';
    for (const key of EDIT_ORDER_MODAL_FIELDS) {
      const value = interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '';
      saveTicketField(ticketId, key, value);
      if (key === 'deadline') warning = deadlineWarning(value, updateTicketDeadline(ticketId, value));
    }
    const fields = getTicketFields(ticketId);
    const payload = getOrderSummaryPayload(fields, ticketId, { submitted: ticket.status !== STATUS.FORM });
    await interaction.reply({ content: 'Order updated.' + warning, flags: MessageFlags.Ephemeral });
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (channel) await channel.send(payload);
    // Freelancers quote on what they see — show them the new version (still without the client's name).
    if (ticket.freelancer_channel_id) {
      const quoteChannel = await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
      await quoteChannel?.send({
        content: '📝 The client updated the order:',
        embeds: [orderSummaryEmbedForFreelancers(fields, ticket.client_id)],
      });
    }
    await refreshOrderCard(interaction.client, ticketId);
    logger.info('Order edited, summary re-posted', { ticketId });
  } catch (err) {
    logger.error('Edit order modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to update order.');
  }
}
