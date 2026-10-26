/**
 * Site webhooks: how the website posts into Discord (site → Discord).
 *
 * The bot does NOT watch the site. The owner composes a post in the site's admin (draft,
 * preview, publish), and the site sends it straight to a Discord webhook of the channel.
 * The bot's only job is to create that webhook (/setup showcase_channel,
 * /setup announcements_channel) and hand over its link. A webhook link can post, edit and
 * delete its own messages in ONE channel — a much narrower power than the bot token, which
 * never leaves the VPS.
 *
 * Created by the bot = owned by the application, which is what lets the site attach link
 * buttons ("View on website", "Get this map") to its posts and sign them as the bot.
 */

export const SHOWCASE_WEBHOOK_NAME = 'SouCampus Showcase';
export const ANNOUNCE_WEBHOOK_NAME = 'SouCampus Announcements';

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

/** The showcase channel's webhook (portfolio posts). */
export function ensureShowcaseWebhook(channel, botUserId, options) {
  return ensureSiteWebhook(channel, botUserId, SHOWCASE_WEBHOOK_NAME, options);
}

/** The announcements channel's webhook (/admin/announce on the site). */
export function ensureAnnounceWebhook(channel, botUserId, options) {
  return ensureSiteWebhook(channel, botUserId, ANNOUNCE_WEBHOOK_NAME, options);
}
