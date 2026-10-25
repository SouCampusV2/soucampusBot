/**
 * Consistent channel name generation. Discord: 2-100 chars, alphanumeric, hyphen, underscore.
 */

/**
 * Sanitize username for channel name (lowercase, replace spaces with hyphen, remove invalid chars).
 * @param {string} username
 * @returns {string}
 */
function sanitizeChannelNamePart(username) {
  if (!username || typeof username !== 'string') return 'unknown';
  return username
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 80) || 'user';
}

/** Channel name prefix per ticket type, so staff can tell tickets apart in the channel list. */
const TICKET_CHANNEL_PREFIX = { order: 'order', help: 'help', application: 'apply' };

/**
 * Ticket channel in ACTIVE ORDERS: order-username / help-username / apply-username.
 * @param {string} type - ticket type
 * @param {string} username - Discord username or displayName
 * @returns {string}
 */
export function getTicketChannelName(type, username) {
  return `${TICKET_CHANNEL_PREFIX[type] ?? 'ticket'}-${sanitizeChannelNamePart(username)}`;
}

/**
 * Quote channel for freelancers: quote-username-building (category QUOTES).
 * @param {string} username
 * @param {string} [suffix] - e.g. 'building'
 * @returns {string}
 */
export function getQuoteChannelName(username, suffix = 'building') {
  return `quote-${sanitizeChannelNamePart(username)}-${sanitizeChannelNamePart(suffix)}`;
}
