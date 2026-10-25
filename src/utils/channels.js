/**
 * Channel helpers shared by "Mark as Complete" and "Close ticket".
 */

import { getSetting } from '../core/GuildConfig.js';
import { getFreelancerRole } from './permissions.js';
import { logger } from './logger.js';

/**
 * Archive a quote channel read-only. Read-only means for every overwrite that allowed writing:
 * @everyone AND the Freelancer role (its overwrite explicitly allows SendMessages, so locking
 * @everyone alone is not enough).
 * @param {import('discord.js').TextChannel} channel
 * @param {object} [logContext]
 */
export async function archiveQuoteChannel(channel, logContext = {}) {
  await archiveChannel(channel, [channel.guild.id, getFreelancerRole(channel.guild)?.id], logContext);
}

/**
 * Move a channel to the archived category (if configured) and take away SendMessages from
 * every given overwrite target. Each step is best-effort and logged on failure, so one missing
 * permission does not leave the rest undone.
 * @param {import('discord.js').TextChannel} channel
 * @param {string[]} lockTargets - role/user ids whose overwrites must become read-only
 * @param {object} [logContext]
 */
export async function archiveChannel(channel, lockTargets, logContext = {}) {
  const archiveCategory = getSetting(channel.guild.id, 'category_archived');
  if (archiveCategory) {
    // lockPermissions: false — keep this channel's own overwrites instead of syncing to the category.
    await channel.setParent(archiveCategory, { lockPermissions: false }).catch((err) =>
      logger.warn('Could not move channel to archive', { ...logContext, channelId: channel.id, error: err.message })
    );
  }
  for (const target of lockTargets.filter(Boolean)) {
    await channel.permissionOverwrites.edit(target, { SendMessages: false }).catch((err) =>
      logger.warn('Could not lock channel', { ...logContext, channelId: channel.id, target, error: err.message })
    );
  }
}
