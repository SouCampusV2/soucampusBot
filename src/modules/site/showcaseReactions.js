/**
 * Showcase reactions: the website posts builds (portfolio, premade, free) through webhooks, and a
 * webhook cannot react. So the bot does it — every new post of OUR webhook in its channel gets
 * the configured reactions (/setup showcase_reactions), like other studios do.
 *
 * Needs the GuildMessages intent (non-privileged) to see the new message. Only messages whose
 * webhookId is one /setup site_channel created (in its own channel) are touched — not people,
 * not other bots, not announcements.
 */

import { getSetting } from '../../core/GuildConfig.js';
import { logger } from '../../utils/logger.js';
import { SITE_CHANNELS } from './showcaseWebhook.js';

const MAX_REACTIONS = 10;
/** Server emoji <:name:id> / animated <a:name:id>. */
const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;
/** One unicode emoji (with modifiers / ZWJ sequences / flags). */
const UNICODE_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\p{Emoji_Modifier}|️|‍(?:\p{Extended_Pictographic})|\p{Regional_Indicator})*$/u;

/**
 * "🔥 👀, <:liberty:123…>" -> ['🔥', '👀', '<:liberty:123…>']; null if something is not an emoji or > 10.
 * @param {string} text
 * @returns {string[] | null}
 */
export function parseReactionList(text) {
  const items = (text ?? '').split(/[\s,]+/).filter(Boolean);
  if (items.length > MAX_REACTIONS) return null;
  return items.every((e) => CUSTOM_EMOJI.test(e) || UNICODE_EMOJI.test(e)) ? items : null;
}

/**
 * React to a message if it is a showcase post of our webhook. Never throws; an emoji that
 * fails (deleted server emoji, missing permission) is logged and the rest still go on.
 * @param {import('discord.js').Message} message
 */
export async function reactToShowcasePost(message) {
  if (!message.guildId || !message.webhookId) return;
  const ours = Object.values(SITE_CHANNELS).some(
    (meta) =>
      meta.reactions &&
      message.channelId === getSetting(message.guildId, meta.channelKey) &&
      message.webhookId === getSetting(message.guildId, meta.webhookKey)
  );
  if (!ours) return;
  const emojis = parseReactionList(getSetting(message.guildId, 'showcase_reactions') ?? '') ?? [];
  for (const emoji of emojis) {
    await message.react(emoji).catch((err) => logger.warn('Showcase reaction failed', { emoji, error: err.message }));
  }
}

/**
 * @param {import('discord.js').Client} client
 */
export function attachShowcaseReactions(client) {
  client.on('messageCreate', (message) => {
    reactToShowcasePost(message).catch((err) => logger.warn('Showcase reactions failed', { error: err.message }));
  });
}
