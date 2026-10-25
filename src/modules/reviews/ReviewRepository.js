/**
 * Review repository — DB access for reviews. One review per ticket.
 */

import { run, get } from '../../core/Database.js';
import { randomBytes } from 'crypto';

/**
 * @param {string} ticketId
 * @returns {object | undefined}
 */
export function getReviewByTicketId(ticketId) {
  return get('SELECT * FROM reviews WHERE ticket_id = ?', [ticketId]);
}

/**
 * A freelancer's track record on one server: delivered orders and reviews.
 * Scoped to the guild — reputation earned on another server does not carry over.
 * @param {string} freelancerId
 * @param {string} guildId
 * @returns {{ delivered: number, reviews: number, avgRating: number | null }}
 */
export function getFreelancerStats(freelancerId, guildId) {
  const delivered =
    get(
      'SELECT COUNT(*) AS n FROM tickets WHERE assigned_freelancer_id = ? AND guild_id = ? AND completed_at IS NOT NULL',
      [freelancerId, guildId]
    )?.n ?? 0;
  const r = get(
    `SELECT COUNT(*) AS n, AVG(r.rating) AS avg FROM reviews r
     JOIN tickets t ON t.id = r.ticket_id
     WHERE r.freelancer_id = ? AND t.guild_id = ?`,
    [freelancerId, guildId]
  );
  return { delivered, reviews: r?.n ?? 0, avgRating: r?.n ? Math.round(r.avg * 10) / 10 : null };
}

/**
 * @param {{ ticketId: string, clientId: string, freelancerId: string, rating: number, comment: string }} data
 * @returns {{ id: string }}
 */
export function createReview(data) {
  const id = randomBytes(4).toString('hex');
  run(
    'INSERT INTO reviews (id, ticket_id, client_id, freelancer_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
    [id, data.ticketId, data.clientId, data.freelancerId, data.rating, data.comment]
  );
  return { id };
}
