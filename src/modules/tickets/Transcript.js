/**
 * Ticket transcript: the whole conversation of a ticket channel as a .txt file, made when the
 * ticket is closed — so "what did we agree on?" is answered by a file, even after the channel
 * is deleted 48 hours later. Sent to the staff log channel and to the client by DM.
 *
 * Needs the MessageContent intent (enabled 2026-10-26 — the bot runs on one server); without it
 * Discord returns empty text for people's messages.
 * Not included: private "Contact freelancer" threads (separate channels).
 */

import { AttachmentBuilder } from 'discord.js';
import { getTicketById } from './TicketRepository.js';
import { getSetting } from '../../core/GuildConfig.js';
import { ticketEvents } from './events.js';
import { logger } from '../../utils/logger.js';

/** Upper bound on messages read per channel (newest kept). */
export const TRANSCRIPT_MAX_MESSAGES = 5000;

/**
 * Read a channel's history, oldest first. Pages backwards 100 at a time (the API maximum).
 * @param {{ messages: { fetch: Function } }} channel
 * @param {number} [max]
 * @returns {Promise<import('discord.js').Message[]>}
 */
export async function fetchAllMessages(channel, max = TRANSCRIPT_MAX_MESSAGES) {
  const all = [];
  let before;
  while (all.length < max) {
    const page = await channel.messages.fetch({ limit: Math.min(100, max - all.length), before });
    if (!page.size) break;
    all.push(...page.values());
    before = page.last().id;
    if (page.size < 100) break;
  }
  return all.reverse();
}

const stamp = (date) => date.toISOString().slice(0, 16).replace('T', ' ');

/** "[embed] Title — Name: value; Name: value" for bot cards and quotes. */
function embedLine(embed) {
  const parts = [embed.title, embed.description].filter(Boolean);
  const fields = (embed.fields ?? []).map((f) => `${f.name}: ${f.value}`).join('; ');
  return `[embed] ${[...parts, fields].filter(Boolean).join(' — ')}`;
}

/**
 * @param {{ id: string, type: string }} ticket
 * @param {import('discord.js').Message[]} messages - oldest first
 * @returns {string}
 */
export function formatTranscript(ticket, messages) {
  const lines = [`Ticket ${ticket.id} (${ticket.type}) — transcript, ${messages.length} messages, times in UTC`, ''];
  for (const m of messages) {
    const who = (m.member?.displayName || m.author.username) + (m.author.bot ? ' [bot]' : '');
    const body = [m.content, ...m.embeds.map(embedLine)].filter(Boolean);
    lines.push(`[${stamp(m.createdAt)}] ${who}: ${body.join('\n    ') || '(no text)'}`);
    for (const a of m.attachments.values()) lines.push(`    attachment: ${a.name} ${a.url}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Build the transcript of the ticket's channel and deliver it. Best-effort: logged, never thrown.
 * Call BEFORE the channel can be deleted (on close — deletion is 48h later).
 * @param {import('discord.js').Client} client
 * @param {string} ticketId
 */
export async function sendTranscript(client, ticketId) {
  try {
    const ticket = getTicketById(ticketId);
    const channel = ticket && (await client.channels.fetch(ticket.client_channel_id).catch(() => null));
    if (!channel) return;
    const text = formatTranscript(ticket, await fetchAllMessages(channel));
    const file = () => new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `transcript-${ticketId}.txt` });

    const logId = ticket.guild_id ? getSetting(ticket.guild_id, 'channel_log') : null;
    const logChannel = logId ? await client.channels.fetch(logId).catch(() => null) : null;
    await logChannel?.send({ content: `📄 Transcript of \`${ticketId}\``, files: [file()] });

    const user = await client.users.fetch(ticket.client_id).catch(() => null);
    await user
      ?.send({ content: `📄 Here is the transcript of your ticket \`${ticketId}\` for your records.`, files: [file()] })
      .catch(() => {}); // closed DMs are normal
    logger.info('Transcript sent', { ticketId, bytes: Buffer.byteLength(text) });
  } catch (err) {
    logger.warn('Transcript failed', { ticketId, error: err.message });
  }
}

/**
 * Send a transcript whenever a ticket is closed (button, manager or hygiene job alike).
 * Returns an unsubscribe function (for tests).
 * @param {import('discord.js').Client} client
 * @returns {() => void}
 */
export function attachTranscripts(client) {
  const onStatus = ({ ticketId, to }) => {
    if (to === 'closed') sendTranscript(client, ticketId);
  };
  ticketEvents.on('status', onStatus);
  return () => ticketEvents.off('status', onStatus);
}
