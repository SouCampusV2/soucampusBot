/**
 * Site webhooks: how the website posts into Discord (site → Discord).
 *
 * The bot does NOT watch the site. The owner composes a post in the site's admin (draft,
 * preview, publish), and the site sends it straight to a Discord webhook of the channel.
 * The bot's only job is to create that webhook (/setup site_channel) and hand over its link.
 * A webhook link can post, edit and delete its own messages in ONE channel — a much narrower
 * power than the bot token, which never leaves the VPS.
 *
 * Created by the bot = owned by the application, which is what lets the site attach link
 * buttons ("View on website", "Get this map") to its posts and sign them as the bot.
 */

import { setSetting } from '../../core/GuildConfig.js';

export const SHOWCASE_WEBHOOK_NAME = 'SouCampus Showcase';
export const ANNOUNCE_WEBHOOK_NAME = 'SouCampus Announcements';

/**
 * Every channel the site posts to: webhook name, where the bot remembers channel and webhook,
 * and the site's environment variable for the link. One webhook per kind, so a new link for
 * one channel never breaks the others. `reactions` — the bot adds /setup showcase_reactions
 * under these posts.
 */
export const SITE_CHANNELS = {
  portfolio: {
    label: 'portfolio works',
    webhookName: SHOWCASE_WEBHOOK_NAME,
    channelKey: 'channel_showcase',
    webhookKey: 'showcase_webhook_id',
    env: 'DISCORD_SHOWCASE_WEBHOOK_URL',
    reactions: true,
  },
  premade: {
    label: 'premade builds',
    webhookName: 'SouCampus Premade',
    channelKey: 'channel_premade',
    webhookKey: 'premade_webhook_id',
    env: 'DISCORD_PREMADE_WEBHOOK_URL',
    reactions: true,
  },
  free: {
    label: 'free builds',
    webhookName: 'SouCampus Free Builds',
    channelKey: 'channel_free',
    webhookKey: 'free_webhook_id',
    env: 'DISCORD_FREE_WEBHOOK_URL',
    reactions: true,
  },
  announcements: {
    label: 'announcements',
    webhookName: ANNOUNCE_WEBHOOK_NAME,
    channelKey: 'channel_announcements',
    webhookKey: 'announce_webhook_id',
    env: 'DISCORD_ANNOUNCE_WEBHOOK_URL',
    reactions: false,
  },
};

/**
 * Return the bot's webhook with this name in this channel, creating it if needed.
 * With rotate, every webhook of that name the bot made here is deleted first — the old link dies.
 * Webhooks made by others are never touched.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} botUserId
 * @param {string} name
 * @param {{ rotate?: boolean }} [options]
 * @returns {Promise<import('discord.js').Webhook>}
 */
export async function ensureSiteWebhook(channel, botUserId, name, { rotate = false } = {}) {
  const ours = (await channel.fetchWebhooks()).filter((h) => h.owner?.id === botUserId && h.name === name);
  if (!rotate && ours.size) return ours.first();
  for (const hook of ours.values()) await hook.delete('Site webhook link rotated');
  return channel.createWebhook({ name, reason: 'Posts from soucampus.online' });
}

/**
 * /setup site_channel: make (or reuse) the webhook of one kind in `channel` and remember both.
 * @param {keyof typeof SITE_CHANNELS} kind
 * @param {import('discord.js').TextChannel} channel
 * @param {string} botUserId
 * @param {{ rotate?: boolean }} [options]
 * @returns {Promise<import('discord.js').Webhook>}
 */
export async function connectSiteChannel(kind, channel, botUserId, options) {
  const meta = SITE_CHANNELS[kind];
  const webhook = await ensureSiteWebhook(channel, botUserId, meta.webhookName, options);
  setSetting(channel.guildId, meta.channelKey, channel.id);
  // Remembered so the bot reacts only to posts of THIS webhook (showcaseReactions.js).
  setSetting(channel.guildId, meta.webhookKey, webhook.id);
  return webhook;
}
