/**
 * Handler for extend_deadline_modal:ticketId — update deadline, post in client + freelancer channel (STEP 9).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById, updateTicketDeadline } from '../../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin } from '../../utils/permissions.js';
import { parseDeadline, todayIso } from '../../utils/dates.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleExtendDeadlineModal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  // A modal is its own door: the manager check on the Extend Deadline button does not carry over.
  if (!isManagerOrAdmin(interaction.member)) {
    await interaction.reply({ content: 'Only a manager or admin can extend the deadline.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!ticket?.client_channel_id) {
    await interaction.reply({ content: 'Ticket or channel not found.', flags: MessageFlags.Ephemeral });
    return;
  }
  const text = interaction.fields.getTextInputValue('new_deadline')?.trim() || '';
  // Strict here (unlike the client's form): a manager's new deadline must be a real, future date.
  const date = parseDeadline(text);
  if (!date) {
    await interaction.reply({
      content: 'Could not read that as a date. Use e.g. `2026-12-25`, `25.12.2026` or `in 2 weeks`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (date < todayIso()) {
    await interaction.reply({ content: `${date} is in the past.`, flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    updateTicketDeadline(ticketId, date);
    await interaction.reply({ content: `Deadline updated to ${date}.`, flags: MessageFlags.Ephemeral });
    const msg = `📅 **Deadline updated** to ${date}.`;
    for (const channelId of [ticket.client_channel_id, ticket.freelancer_channel_id].filter(Boolean)) {
      const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
      if (ch) await ch.send(msg);
    }
    logger.info('Deadline extended', { ticketId, date });
  } catch (err) {
    logger.error('extend_deadline_modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to update deadline.');
  }
}
