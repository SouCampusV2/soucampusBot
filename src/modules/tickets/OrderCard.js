/**
 * The order card: ONE live message in the client's channel that always shows where the order
 * is — stage, quotes, freelancer, agreed price, deadline, estimate, budget. Edited in place;
 * its id lives in tickets.order_card_msg_id so it survives restarts.
 *
 * Refreshed on every status change (via ticketEvents) and directly by handlers that change
 * what the card shows without a status change (quotes, declines, deadline, edits).
 * Replaces the standalone quote counter (2026-10-26). No "of N freelancers": counting role
 * members needs the privileged GuildMembers intent, which the bot deliberately does not request.
 */

import { get, run } from '../../core/Database.js';
import { getTicketById, getTicketFields } from './TicketRepository.js';
import { ticketEvents } from './events.js';
import { orderCardEmbed } from '../../embeds/templates.js';
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
 * Create or update the card. Best-effort: logged, never thrown — the card is a view, the
 * action that triggered it already happened.
 * @param {import('discord.js').Client} client
 * @param {string} ticketId
 */
export async function refreshOrderCard(client, ticketId) {
  try {
    const ticket = getTicketById(ticketId);
    // Orders only, and only once the form is done — before that the form itself is the view.
    if (ticket?.type !== 'order' || ticket.status === 'form') return;
    const channel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (!channel) return;

    const agreedPrice = get("SELECT price FROM proposals WHERE ticket_id = ? AND status = 'accepted'", [ticketId])?.price;
    const payload = { embeds: [orderCardEmbed(ticket, getTicketFields(ticketId), { ...countQuoteActivity(ticketId), agreedPrice })] };

    const existing = ticket.order_card_msg_id
      ? await channel.messages.fetch(ticket.order_card_msg_id).catch(() => null)
      : null;
    if (existing) {
      await existing.edit(payload);
      return;
    }
    const message = await channel.send(payload);
    run('UPDATE tickets SET order_card_msg_id = ? WHERE id = ?', [message.id, ticketId]);
    // Pinned so it is one click away however long the chat gets. Needs Manage Messages — optional.
    await message.pin?.().catch((err) => logger.debug('Order card not pinned', { ticketId, error: err.message }));
  } catch (err) {
    logger.warn('Could not refresh order card', { ticketId, error: err.message });
  }
}

/**
 * Keep cards in sync with status changes. Returns an unsubscribe function (for tests).
 * @param {import('discord.js').Client} client
 * @returns {() => void}
 */
export function attachOrderCard(client) {
  const onStatus = ({ ticketId, type }) => {
    if (type === 'order') refreshOrderCard(client, ticketId);
  };
  ticketEvents.on('status', onStatus);
  return () => ticketEvents.off('status', onStatus);
}
