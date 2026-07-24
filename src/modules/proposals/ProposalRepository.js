/**
 * Proposal repository — DB access for proposals (quotes).
 */

import { run, get, query } from '../../core/Database.js';
import { logger } from '../../utils/logger.js';
import { randomBytes } from 'crypto';

function generateId() {
  return randomBytes(6).toString('hex');
}

/**
 * Create a new proposal (quote).
 * @param {{ ticketId: string, freelancerId: string, price: string, deadline: string, message: string }}
 * @returns {{ id: string }}
 */
export function createProposal(data) {
  const id = generateId();
  try {
    run(
      `INSERT INTO proposals (id, ticket_id, freelancer_id, price, deadline, message, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [id, data.ticketId, data.freelancerId, data.price, data.deadline, data.message ?? '']
    );
    logger.info('Proposal created', { proposalId: id, ticketId: data.ticketId, freelancerId: data.freelancerId });
    return { id };
  } catch (err) {
    logger.error('ProposalRepository.createProposal failed', { error: err.message });
    throw err;
  }
}

/**
 * Get proposal by id.
 * @param {string} proposalId
 * @returns {object | undefined}
 */
export function getProposalById(proposalId) {
  return get('SELECT * FROM proposals WHERE id = ?', [proposalId]);
}

/**
 * Get all proposals for a ticket.
 * @param {string} ticketId
 * @returns {object[]}
 */
export function getProposalsByTicketId(ticketId) {
  return query('SELECT * FROM proposals WHERE ticket_id = ? ORDER BY created_at', [ticketId]);
}

/**
 * Set proposal status to accepted and assign freelancer to ticket.
 * @param {string} proposalId
 * @param {string} ticketId
 * @param {string} freelancerId
 */
export function acceptProposal(proposalId, ticketId, freelancerId) {
  run('UPDATE proposals SET status = ? WHERE id = ?', ['accepted', proposalId]);
  run('UPDATE tickets SET assigned_freelancer_id = ? WHERE id = ?', [freelancerId, ticketId]);
  logger.info('Proposal accepted', { proposalId, ticketId, freelancerId });
}

/**
 * Decline proposal and log reason to action_log.
 * @param {string} proposalId
 * @param {string} ticketId
 * @param {string} actorId - client who declined
 * @param {string} reason - 'price' | 'portfolio' | 'deadline'
 */
export function declineProposal(proposalId, ticketId, actorId, reason) {
  run('UPDATE proposals SET status = ? WHERE id = ?', ['declined', proposalId]);
  run('INSERT INTO action_log (ticket_id, actor_id, action, detail) VALUES (?, ?, ?, ?)', [
    ticketId,
    actorId,
    'decline_quote',
    reason,
  ]);
  logger.info('Proposal declined', { proposalId, ticketId, reason });
}
