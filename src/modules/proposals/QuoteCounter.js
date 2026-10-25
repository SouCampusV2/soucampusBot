/**
 * The live "quotes / not interested" counter in the client's channel (STEP 7).
 *
 * One message per ticket, edited in place; its id lives in tickets.quote_counter_msg_id so
 * it survives restarts. No "of N freelancers": counting role members needs the privileged
 * GuildMembers intent, which the bot deliberately does not request (docs/RULES.md).
 */

import { get, run } from '../../core/Database.js';
import { quoteCounterText } from '../../embeds/templates.js';
import { logger } from '../../utils/logger.js';

/**
 * @param {string} ticketId
 * @returns {{ quotes: number, declined: number }}
 */
export function countQuoteActivity(ticketId) {
  const quotes = get('SELECT COUNT(*) AS n FROM proposals WHERE ticket_id = ?', [ticketId])?.n ?? 0;
  const declined =
    get("SELECT COUNT(DISTINCT actor_id) AS n FROM action_log WHERE ticket_id = ? AND action = 'decline_order'", [ticketId])
      ?.n ?? 0;
  return { quotes, declined };
}

/**
 * Create or refresh the counter message. Best-effort: a failure is logged, never thrown —
 * the counter is a convenience, the quote itself already went through.
 * @param {import('discord.js').Client} client
 * @param {{ id: string, client_channel_id: string }} ticket
 */
export async function refreshQuoteCounter(client, ticket) {
  try {
    const channel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (!channel) return;
    const text = quoteCounterText(countQuoteActivity(ticket.id));
    const msgId = get('SELECT quote_counter_msg_id AS id FROM tickets WHERE id = ?', [ticket.id])?.id;
    const existing = msgId ? await channel.messages.fetch(msgId).catch(() => null) : null;
    if (existing) {
      await existing.edit(text);
      return;
    }
    const message = await channel.send(text);
    run('UPDATE tickets SET quote_counter_msg_id = ? WHERE id = ?', [message.id, ticket.id]);
  } catch (err) {
    logger.warn('Could not refresh quote counter', { ticketId: ticket.id, error: err.message });
  }
}
