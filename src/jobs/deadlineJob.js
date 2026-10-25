/**
 * node-cron: daily at 09:00 (bot timezone) remind both channels about orders due today or tomorrow.
 */

import cron from 'node-cron';
import { getTicketsWithDeadlineOn } from '../modules/tickets/TicketRepository.js';
import { extendDeadlineButtonRow } from '../embeds/templates.js';
import { todayIso } from '../utils/dates.js';
import { logger } from '../utils/logger.js';

/**
 * Reminders go out in this timezone. The VPS clock is usually UTC; 09:00 UTC would be noon for
 * the owner in Estonia. Override with BOT_TIMEZONE (IANA name, e.g. "Europe/Berlin").
 */
export const BOT_TIMEZONE = process.env.BOT_TIMEZONE || 'Europe/Tallinn';

/**
 * Post reminders for every open order due today or tomorrow.
 * @param {import('discord.js').Client} client
 * @param {Date} [now]
 * @returns {Promise<number>} how many tickets were reminded
 */
export async function sendDeadlineReminders(client, now = new Date()) {
  const today = todayIso(now);
  const tomorrow = todayIso(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const tickets = getTicketsWithDeadlineOn([today, tomorrow]);
  for (const ticket of tickets) {
    const when = ticket.deadline === today ? 'is **today**' : 'is **tomorrow**';
    const msg = `⏰ **Deadline reminder:** this order's deadline ${when} (${ticket.deadline}).`;
    try {
      if (ticket.client_channel_id) {
        const ch = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
        if (ch) await ch.send(msg);
      }
      if (ticket.freelancer_channel_id) {
        const ch = await client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
        if (ch) await ch.send({ content: `${msg} A manager can extend it below.`, components: [extendDeadlineButtonRow(ticket.id)] });
      }
      logger.info('Deadline reminder sent', { ticketId: ticket.id, deadline: ticket.deadline });
    } catch (err) {
      logger.error('Deadline reminder failed for ticket', { ticketId: ticket.id, error: err.message });
    }
  }
  return tickets.length;
}

/**
 * Schedule the daily run at 09:00 in BOT_TIMEZONE.
 * @param {import('discord.js').Client} client
 */
export function scheduleDeadlineJob(client) {
  cron.schedule('0 9 * * *', () => sendDeadlineReminders(client), { timezone: BOT_TIMEZONE, name: 'deadline-reminders' });
  logger.info('Deadline cron job scheduled', { at: '09:00', timezone: BOT_TIMEZONE });
}
