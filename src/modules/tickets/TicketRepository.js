/**
 * Ticket repository — DB access for tickets.
 */

import { run, get, query } from '../../core/Database.js';
import { logger } from '../../utils/logger.js';
import { randomBytes } from 'crypto';
import { initialStatus } from './TicketStatus.js';

/**
 * Generate short unique ticket id.
 * @returns {string}
 */
function generateTicketId() {
  return randomBytes(6).toString('hex');
}

/**
 * Create a new ticket.
 * @param {{ type: string, clientId: string, clientChannelId?: string }} data
 * @returns {{ id: string }}
 */
export function createTicket(data) {
  const id = generateTicketId();
  try {
    run(
      `INSERT INTO tickets (id, type, status, guild_id, client_id, client_channel_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.type, initialStatus(data.type), data.guildId ?? null, data.clientId, data.clientChannelId ?? null]
    );
    logger.info('Ticket created', { ticketId: id, type: data.type, clientId: data.clientId });
    return { id };
  } catch (err) {
    logger.error('TicketRepository.createTicket failed', { error: err.message });
    throw err;
  }
}

/**
 * Get ticket by id.
 * @param {string} ticketId
 * @returns {object | undefined}
 */
export function getTicketById(ticketId) {
  return get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
}

/**
 * Get ticket by client channel id (for order dialog message handling).
 * @param {string} clientChannelId
 * @returns {object | undefined}
 */
export function getTicketByClientChannelId(clientChannelId) {
  return get('SELECT * FROM tickets WHERE client_channel_id = ?', [clientChannelId]);
}

/**
 * Get ticket by channel id (client or freelancer channel) for /invite command.
 * @param {string} channelId
 * @returns {object | undefined}
 */
export function getTicketByChannelId(channelId) {
  return get('SELECT * FROM tickets WHERE client_channel_id = ? OR freelancer_channel_id = ?', [channelId, channelId]);
}

/**
 * Get all ticket_fields for a ticket (for order summary / step count).
 * @param {string} ticketId
 * @returns {{ field_name: string, field_value: string }[]}
 */
export function getTicketFields(ticketId) {
  return query('SELECT field_name, field_value FROM ticket_fields WHERE ticket_id = ?', [ticketId]);
}

/**
 * Save one field for a ticket (replace if same field_name for this ticket).
 * @param {string} ticketId
 * @param {string} fieldName
 * @param {string} value
 */
export function saveTicketField(ticketId, fieldName, value) {
  run('DELETE FROM ticket_fields WHERE ticket_id = ? AND field_name = ?', [ticketId, fieldName]);
  run('INSERT INTO ticket_fields (ticket_id, field_name, field_value) VALUES (?, ?, ?)', [
    ticketId,
    fieldName,
    value,
  ]);
}

/**
 * Update ticket deadline (from order dialog question 2).
 * @param {string} ticketId
 * @param {string} deadline
 */
export function updateTicketDeadline(ticketId, deadline) {
  run('UPDATE tickets SET deadline = ? WHERE id = ?', [deadline, ticketId]);
}

/**
 * Update client channel id for a ticket.
 * @param {string} ticketId
 * @param {string} clientChannelId
 */
export function setClientChannelId(ticketId, clientChannelId) {
  run('UPDATE tickets SET client_channel_id = ? WHERE id = ?', [clientChannelId, ticketId]);
}

/**
 * Update freelancer (quote) channel id for a ticket (STEP 4).
 * @param {string} ticketId
 * @param {string} freelancerChannelId
 */
export function setFreelancerChannelId(ticketId, freelancerChannelId) {
  run('UPDATE tickets SET freelancer_channel_id = ? WHERE id = ?', [freelancerChannelId, ticketId]);
}

/**
 * Persist last relay message ids (client + freelancer channel) so replies can reference them.
 * Survives bot restarts (STEP 6).
 * @param {string} ticketId
 * @param {{ clientMsgId: string, freelancerMsgId: string }} ids
 */
export function setRelayMessageIdsDb(ticketId, ids) {
  run('UPDATE tickets SET relay_client_msg_id = ?, relay_freelancer_msg_id = ? WHERE id = ?', [
    ids.clientMsgId,
    ids.freelancerMsgId,
    ticketId,
  ]);
}

/**
 * Read last relay message ids for a ticket.
 * @param {string} ticketId
 * @returns {{ clientMsgId: string, freelancerMsgId: string } | undefined}
 */
export function getRelayMessageIdsDb(ticketId) {
  const row = get('SELECT relay_client_msg_id, relay_freelancer_msg_id FROM tickets WHERE id = ?', [ticketId]);
  if (!row || (!row.relay_client_msg_id && !row.relay_freelancer_msg_id)) return undefined;
  return { clientMsgId: row.relay_client_msg_id, freelancerMsgId: row.relay_freelancer_msg_id };
}

/**
 * Set the epoch-ms time at which the quote channel should be created (STEP 4), or NULL to clear.
 * @param {string} ticketId
 * @param {number | null} dueAtMs
 */
export function setQuoteChannelDueAt(ticketId, dueAtMs) {
  run('UPDATE tickets SET quote_channel_due_at = ? WHERE id = ?', [dueAtMs, ticketId]);
}

/**
 * Tickets that still owe a quote channel (due time set, channel not yet created).
 * Used on startup to recover pending timers after a restart.
 * @returns {object[]}
 */
export function getPendingQuoteChannelTickets() {
  return query(
    'SELECT * FROM tickets WHERE quote_channel_due_at IS NOT NULL AND freelancer_channel_id IS NULL'
  );
}
