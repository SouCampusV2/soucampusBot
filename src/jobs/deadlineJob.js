/**
 * node-cron: daily check for tickets with deadline within 24 hours; post reminder in client + freelancer channel.
 */

import cron from 'node-cron';
import { query } from '../core/Database.js';
import { extendDeadlineButtonRow } from '../embeds/templates.js';
import { logger } from '../utils/logger.js';

/**
 * Tickets with deadline in the next 24 hours (SQLite date comparison).
 * @returns {object[]}
 */
function getTicketsDueWithin24h() {
  try {
    return query(
      `SELECT * FROM tickets
       WHERE deadline IS NOT NULL AND deadline != ''
         AND date(deadline) <= date('now', '+1 day')
         AND date(deadline) >= date('now')
         AND status IN ('open', 'assigned', 'paid')`
    );
  } catch (err) {
    logger.error('deadlineJob getTicketsDueWithin24h failed', { error: err.message });
    return [];
  }
}

/**
 * Schedule daily run at 09:00. Post reminder in client_channel and freelancer_channel.
 * @param {import('discord.js').Client} client
 */
export function scheduleDeadlineJob(client) {
  cron.schedule('0 9 * * *', async () => {
    const tickets = getTicketsDueWithin24h();
    for (const ticket of tickets) {
      try {
        const msg = `⏰ **Deadline reminder:** This order's deadline is within 24 hours (${ticket.deadline}).`;
        if (ticket.client_channel_id) {
          const ch = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
          if (ch) await ch.send(msg).catch(() => {});
        }
        if (ticket.freelancer_channel_id) {
          const ch = await client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
          if (ch) await ch.send({ content: msg + ' Manager can extend below.', components: [extendDeadlineButtonRow(ticket.id)] }).catch(() => {});
        }
        logger.info('Deadline reminder sent', { ticketId: ticket.id });
      } catch (err) {
        logger.error('Deadline reminder failed for ticket', { ticketId: ticket.id, error: err.message });
      }
    }
  });
  logger.info('Deadline cron job scheduled (daily 09:00)');
}
