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
