/**
 * The rules card: one per server, edited in place.
 * The message id is remembered (rules_message_id), so /setup rules after a text change
 * updates the same post instead of stacking copies. If that post is gone or sits in
 * another channel, a new one is posted and the old one (if still there) is deleted.
 */

import { getRulesPayload } from '../embeds/templates.js';
import { getSetting, setSetting } from '../core/GuildConfig.js';
import { logger } from './logger.js';

/**
 * @param {import('discord.js').TextChannel} channel
 * @returns {Promise<'updated' | 'posted'>}
 */
export async function upsertRules(channel) {
  const guildId = channel.guildId;
  const payload = getRulesPayload(guildId);
  const oldChannelId = getSetting(guildId, 'channel_rules');
  const oldMessageId = getSetting(guildId, 'rules_message_id');

  if (oldMessageId && oldChannelId === channel.id) {
    const existing = await channel.messages.fetch(oldMessageId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return 'updated';
    }
  }

  const message = await channel.send(payload);
  setSetting(guildId, 'channel_rules', channel.id);
  setSetting(guildId, 'rules_message_id', message.id);

  // Moved to another channel: take the old copy down so there is one set of rules.
  if (oldMessageId && oldChannelId && oldChannelId !== channel.id) {
    const oldChannel = await channel.client?.channels.fetch(oldChannelId).catch(() => null);
    const old = await oldChannel?.messages.fetch(oldMessageId).catch(() => null);
    await old?.delete().catch((err) => logger.debug('Old rules post not deleted', { error: err.message }));
  }
  return 'posted';
}
