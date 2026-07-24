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

/**
 * Order/help/application channel: order-username (category ACTIVE ORDERS).
 * @param {string} username - Discord username or displayName
 * @returns {string}
 */
export function getOrderChannelName(username) {
  return `order-${sanitizeChannelNamePart(username)}`;
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
