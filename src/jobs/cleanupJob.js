/**
 * Cleanup job, every 10 minutes (and once on startup):
 *   - delete channels of closed tickets once their channel_delete_at has passed;
 *   - hygiene: remind about order forms left unfinished for 48h, close them 24h after that.
 * Sweeps over the database (not in-memory timers per ticket), so everything survives restarts.
 */

import {
  getTicketsDueForDeletion,
  setChannelDeleteAt,
  getTicketsInForm,
  setStaleRemindedAt,
} from '../modules/tickets/TicketRepository.js';
import { beginClose, archiveClosed } from '../modules/tickets/closing.js';
import { CLEANUP_INTERVAL_MS, FORM_REMIND_AFTER_MS, FORM_CLOSE_AFTER_REMIND_MS } from '../constants.js';
import { logger } from '../utils/logger.js';

/**
 * Delete every channel that is due. A channel that is already gone (deleted by hand) only has
 * its schedule cleared.
 * @param {import('discord.js').Client} client
 * @returns {Promise<number>} how many channels were deleted
 */
export async function sweepDueChannels(client) {
  let deleted = 0;
  for (const ticket of getTicketsDueForDeletion(Date.now())) {
    try {
      const channel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
      if (channel) {
        await channel.delete(`Ticket ${ticket.id} closed`);
        deleted++;
      }
      setChannelDeleteAt(ticket.id, null);
      logger.info('Closed ticket channel removed', { ticketId: ticket.id, existed: Boolean(channel) });
    } catch (err) {
      // Left scheduled: the next sweep retries (e.g. a missing Manage Channels permission gets fixed).
      logger.error('Could not delete closed ticket channel', { ticketId: ticket.id, error: err.message });
    }
  }
  return deleted;
}

/** SQLite CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS', UTC) -> epoch ms. */
const createdMs = (createdAt) => Date.parse(`${createdAt.replace(' ', 'T')}Z`);

/**
 * Orders abandoned in the form stage: one reminder after FORM_REMIND_AFTER_MS, then an
 * automatic close FORM_CLOSE_AFTER_REMIND_MS later (same close as the button: archive + 48h).
 * @param {import('discord.js').Client} client
 * @param {number} [now]
 */
export async function sweepAbandonedForms(client, now = Date.now()) {
  for (const ticket of getTicketsInForm()) {
    try {
      if (!ticket.stale_reminded_at) {
        if (now - createdMs(ticket.created_at) < FORM_REMIND_AFTER_MS) continue;
        // Recorded before sending: a failed send must not turn into a reminder every 10 minutes.
        setStaleRemindedAt(ticket.id, now);
        const closeAt = Math.floor((now + FORM_CLOSE_AFTER_REMIND_MS) / 1000);
        const channel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
        await channel?.send(
          `<@${ticket.client_id}> your order form is not finished yet — click **Fill order form** above. ` +
            `If it stays unfinished, this ticket closes <t:${closeAt}:R>.`
        );
        logger.info('Abandoned form reminded', { ticketId: ticket.id });
      } else if (now - ticket.stale_reminded_at >= FORM_CLOSE_AFTER_REMIND_MS) {
        const closed = beginClose(ticket.id);
        if (closed) {
          await archiveClosed(client, closed, {
            closedBy: client.user.id,
            note: 'Closed automatically: the order form was not finished. Open a new ticket any time.',
          });
        }
      }
    } catch (err) {
      logger.error('Form hygiene failed for ticket', { ticketId: ticket.id, error: err.message });
    }
  }
}

/**
 * Sweep now (catches up on anything that came due while the bot was offline) and then periodically.
 * @param {import('discord.js').Client} client
 */
export function scheduleCleanupJob(client) {
  const sweep = () =>
    sweepDueChannels(client)
      .then(() => sweepAbandonedForms(client))
      .catch((err) => logger.error('Cleanup sweep failed', { error: err.message }));
  sweep();
  setInterval(sweep, CLEANUP_INTERVAL_MS).unref();
  logger.info('Cleanup job scheduled', { everyMinutes: CLEANUP_INTERVAL_MS / 60_000 });
}
