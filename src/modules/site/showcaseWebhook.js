/**
 * Showcase webhook: how the website posts portfolio works into Discord (site → Discord).
 *
 * The bot does NOT watch the site. The owner composes a post in the site's admin (draft,
 * preview, publish), and the site sends it straight to a Discord webhook of the showcase
 * channel. The bot's only job is to create that webhook (/setup showcase_channel) and hand
 * over its link. A webhook link can post, edit and delete its own messages in ONE channel —
 * a much narrower power than the bot token, which never leaves the VPS.
 *
 * Created by the bot = owned by the application, which is what lets the site attach link
 * buttons ("View on website", "Get this map") to its posts.
 */

export const SHOWCASE_WEBHOOK_NAME = 'SouCampus Showcase';

/**
 * Return the bot's showcase webhook in this channel, creating it if needed.
 * With rotate, every showcase webhook the bot made here is deleted first — the old link dies.
 * Webhooks made by others are never touched.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} botUserId
 * @param {{ rotate?: boolean }} [options]
 * @returns {Promise<import('discord.js').Webhook>}
 */
export async function ensureShowcaseWebhook(channel, botUserId, { rotate = false } = {}) {
  const ours = (await channel.fetchWebhooks()).filter((h) => h.owner?.id === botUserId && h.name === SHOWCASE_WEBHOOK_NAME);
  if (!rotate && ours.size) return ours.first();
  for (const hook of ours.values()) await hook.delete('Showcase link rotated');
  return channel.createWebhook({ name: SHOWCASE_WEBHOOK_NAME, reason: 'Showcase posts from soucampus.online' });
}
