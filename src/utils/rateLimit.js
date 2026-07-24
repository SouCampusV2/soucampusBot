/**
 * Rate limit: max 1 ticket creation per user per 60 seconds.
 */

import { TICKET_CREATE_COOLDOWN_MS } from '../constants.js';
import { logger } from './logger.js';

/** userId -> last create timestamp */
const lastCreateByUser = new Map();

/**
 * Check if user is within cooldown; if not, record and return true. If yes, return false.
 * @param {string} userId
 * @returns {boolean} true if allowed, false if rate limited
 */
export function tryConsumeTicketCreate(userId) {
  const now = Date.now();
  const last = lastCreateByUser.get(userId);
  if (last != null && now - last < TICKET_CREATE_COOLDOWN_MS) {
    logger.warn('Ticket create rate limited', { userId });
    return false;
  }
  lastCreateByUser.set(userId, now);
  return true;
}
