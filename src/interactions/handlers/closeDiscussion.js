/**
 * Handler for close_discussion:ticketId:threadId — archive the discussion thread (client/freelancer/manager).
 */

import { logger } from '../../utils/logger.js';

export async function handleCloseDiscussion(interaction, parts) {
  const ticketId = parts[1];
  const threadId = parts[2];
  if (!ticketId || !threadId) {
    await interaction.reply({ content: 'Invalid data.', ephemeral: true });
    return;
  }
  try {
    const thread = await interaction.client.channels.fetch(threadId).catch(() => null);
    if (!thread?.isThread()) {
      await interaction.reply({ content: 'Thread not found.', ephemeral: true });
      return;
    }
    await interaction.update({
      content: (interaction.message.content || '') + '\n\n✅ Дискуссия закрыта.',
      components: [],
    }).catch(() => {});
    await thread.setArchived(true);
    logger.info('Discussion thread closed', { ticketId, threadId });
  } catch (err) {
    logger.error('close_discussion failed', { ticketId, threadId, error: err.message });
    await interaction.reply({ content: 'Failed to close thread.', ephemeral: true }).catch(() => {});
  }
}
