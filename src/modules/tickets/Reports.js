/**
 * Read-only reports for managers: the open-ticket overview (/orders) and the numbers (/stats).
 * Pure queries — no Discord here, so they are easy to test and reuse (e.g. a weekly digest).
 */

import { query, get } from '../../core/Database.js';

/** Stages that are still "in progress" (form included: someone opened a ticket and stopped). */
const OPEN_STATUSES = ['form', 'open', 'assigned', 'paid', 'completed', 'accepted', 'rejected'];
/** Stages where a deadline still matters. */
const WORKING_STATUSES = ['open', 'assigned', 'paid'];

/**
 * Open (not closed) tickets of a server, overdue orders first, then oldest first.
 * @param {string} guildId
 * @param {string} todayIso - 'YYYY-MM-DD'
 * @param {string} [status] - only this status
 * @returns {(object & { overdue: boolean })[]}
 */
export function listOpenTickets(guildId, todayIso, status) {
  const statuses = status ? [status] : OPEN_STATUSES;
  const rows = query(
    `SELECT * FROM tickets WHERE guild_id = ? AND status IN (${statuses.map(() => '?').join(', ')}) ORDER BY created_at`,
    [guildId, ...statuses]
  );
  return rows
    .map((t) => ({ ...t, overdue: Boolean(t.deadline && t.deadline < todayIso && WORKING_STATUSES.includes(t.status)) }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue));
}

/**
 * First number in what a freelancer typed as a price: "€300", "250 eur", "1,200€", "€99.50".
 * @param {string} text
 * @returns {number | null}
 */
export function parsePrice(text) {
  const m = (text ?? '').replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Funnel, money and reputation for tickets created since `sinceMs`.
 * Payment is read from action_log ('confirm_payment'), not from the legacy flag — and a paid
 * order that was later closed still counts as paid.
 * @param {string} guildId
 * @param {number} sinceMs
 */
export function computeStats(guildId, sinceMs) {
  const since = new Date(sinceMs).toISOString().slice(0, 19).replace('T', ' ');
  const inWindow = 'guild_id = ? AND created_at >= ?';
  const count = (sql, params) => get(sql, params)?.n ?? 0;

  const orders = count(`SELECT COUNT(*) n FROM tickets WHERE type = 'order' AND ${inWindow}`, [guildId, since]);
  const paid = count(
    `SELECT COUNT(DISTINCT a.ticket_id) n FROM action_log a JOIN tickets t ON t.id = a.ticket_id
     WHERE a.action = 'confirm_payment' AND t.guild_id = ? AND t.created_at >= ?`,
    [guildId, since]
  );
  const delivered = count(
    `SELECT COUNT(*) n FROM tickets WHERE type = 'order' AND completed_at IS NOT NULL AND ${inWindow}`,
    [guildId, since]
  );
  const prices = query(
    `SELECT p.price FROM proposals p JOIN tickets t ON t.id = p.ticket_id
     WHERE p.status = 'accepted' AND t.guild_id = ? AND t.created_at >= ?`,
    [guildId, since]
  )
    .map((r) => parsePrice(r.price))
    .filter((n) => n != null);
  const rating = get(
    `SELECT AVG(r.rating) avg, COUNT(*) n FROM reviews r JOIN tickets t ON t.id = r.ticket_id
     WHERE t.guild_id = ? AND t.created_at >= ?`,
    [guildId, since]
  );
  const byType = (type) => count(`SELECT COUNT(*) n FROM tickets WHERE type = ? AND ${inWindow}`, [type, guildId, since]);
  const byStatus = (status) =>
    count(`SELECT COUNT(*) n FROM tickets WHERE type = 'application' AND status = ? AND ${inWindow}`, [status, guildId, since]);

  return {
    orders,
    paid,
    delivered,
    conversion: orders ? Math.round((paid / orders) * 100) : 0,
    // Average of agreed (accepted-quote) prices. Not "revenue": an accepted quote may never be paid.
    avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
    avgRating: rating?.n ? Math.round(rating.avg * 10) / 10 : null,
    reviews: rating?.n ?? 0,
    help: byType('help'),
    applications: byType('application'),
    accepted: byStatus('accepted'),
  };
}
