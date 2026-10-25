/**
 * Handler for close_discussion:ticketId:threadId — archive the discussion thread (client/freelancer/manager).
 */

import { MessageFlags } from 'discord.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';

export async function handleCloseDiscussion(interaction, parts) {
  const ticketId = parts[1];
  const threadId = parts[2];
  if (!ticketId || !threadId) {
    await interaction.reply({ content: 'Invalid data.', flags: MessageFlags.Ephemeral });
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
