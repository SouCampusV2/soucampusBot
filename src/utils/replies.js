/**
 * Interaction reply helpers shared by all handlers.
 */

import { MessageFlags } from 'discord.js';
import { logger } from './logger.js';

/**
 * Tell the user something went wrong, whatever state the interaction is in:
 * reply() if it was never answered, followUp() if it was already replied to or deferred.
 * Never throws — it is meant for catch blocks.
 * @param {import('discord.js').Interaction} interaction
 * @param {string} [content]
 */
export async function replyError(interaction, content = 'Something went wrong.') {
  const payload = { content, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (err) {
    logger.debug('Could not send error reply', { error: err.message });
  }
}
