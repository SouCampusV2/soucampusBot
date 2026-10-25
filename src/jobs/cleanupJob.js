/**
 * Cleanup job: delete channels of closed tickets once their channel_delete_at has passed.
 * A sweep over the database (not one in-memory timer per ticket), so deletions survive restarts.
 */

import { getTicketsDueForDeletion, setChannelDeleteAt } from '../modules/tickets/TicketRepository.js';
import { CLEANUP_INTERVAL_MS } from '../constants.js';
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

/**
 * Sweep now (catches up on anything that came due while the bot was offline) and then periodically.
 * @param {import('discord.js').Client} client
 */
export function scheduleCleanupJob(client) {
  const sweep = () =>
    sweepDueChannels(client).catch((err) => logger.error('Cleanup sweep failed', { error: err.message }));
  sweep();
  setInterval(sweep, CLEANUP_INTERVAL_MS).unref();
  logger.info('Cleanup job scheduled', { everyMinutes: CLEANUP_INTERVAL_MS / 60_000 });
}
