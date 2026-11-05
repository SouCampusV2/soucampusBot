/**
 * Who the bot pings when it creates a channel (a new ticket, a quote channel).
 * Set with `/setup notify` — a person or a role; stored as "user:<id>" or "role:<id>".
 */

import { getSetting } from '../core/GuildConfig.js';
import { logger } from './logger.js';

/**
 * Parse the stored value into a mention and the allowedMentions that let it ping.
 * @param {string | null | undefined} value
 * @returns {{ mention: string, allowedMentions: object } | null}
 */
export function parseNotifyTarget(value) {
  const match = /^(user|role):(\d{5,25})$/.exec(value || '');
  if (!match) return null;
  const [, kind, id] = match;
  return kind === 'user'
    ? { mention: `<@${id}>`, allowedMentions: { users: [id] } }
    : { mention: `<@&${id}>`, allowedMentions: { roles: [id] } };
}

/**
 * Ping the configured person/role in a channel the bot just created. Silent if nothing is set;
 * never throws (a failed ping must not break opening a ticket).
 * @param {import('discord.js').TextChannel} channel
 * @param {string} text - what happened, e.g. "New order ticket #11"
 */
export async function pingStaff(channel, text) {
  const target = parseNotifyTarget(getSetting(channel.guild.id, 'notify_target'));
  if (!target) return;
  try {
    await channel.send({ content: `🔔 ${target.mention} — ${text}`, allowedMentions: target.allowedMentions });
  } catch (err) {
    logger.warn('Staff ping failed', { channelId: channel.id, error: err.message });
  }
}
