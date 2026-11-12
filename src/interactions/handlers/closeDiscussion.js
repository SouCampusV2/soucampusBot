/**
 * Handler for close_discussion:ticketId:threadId — archive the discussion thread (client/freelancer/manager).
 */

import { MessageFlags } from 'discord.js';
import { getTicketById } from '../../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin, isBuilder } from '../../utils/permissions.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleCloseDiscussion(interaction, parts) {
  const ticketId = parts[1];
  const threadId = parts[2];
  if (!ticketId || !threadId) {
    await interaction.reply({ content: 'Invalid data.', flags: MessageFlags.Ephemeral });
    return;
  }
  // Every button is a public door (security audit 2026-11, B-05): this was the one handler that
  // did not ask who pressed it, so anyone who saw the button could archive the thread named in it.
  const ticket = getTicketById(ticketId);
  const member = interaction.member;
  const allowed =
    ticket && (ticket.client_id === interaction.user.id || isBuilder(member) || isManagerOrAdmin(member));
  if (!allowed) {
    await interaction.reply({
      content: 'Only the client, the builders and managers can close this discussion.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  try {
    const thread = await interaction.client.channels.fetch(threadId).catch(() => null);
    if (!thread?.isThread()) {
      await interaction.reply({ content: 'Thread not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({
      content: (interaction.message.content || '') + '\n\n✅ Discussion closed.',
      components: [],
    }).catch(() => {});
    await thread.setArchived(true);
    logger.info('Discussion thread closed', { ticketId, threadId });
  } catch (err) {
    logger.error('close_discussion failed', { ticketId, threadId, error: err.message });
    await replyError(interaction, 'Failed to close thread.');
  }
}
