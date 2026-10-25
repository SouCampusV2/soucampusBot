/**
 * Proposal repository — DB access for proposals (quotes).
 */

import { run, get, query } from '../../core/Database.js';
import { logger } from '../../utils/logger.js';
import { randomBytes } from 'crypto';
import { STATUS, transitionTicket } from '../tickets/TicketStatus.js';

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
 * Why a freelancer may NOT quote on this ticket right now, or null if they may.
 * One rule for both the Submit Quote button and its modal.
 * @param {{ id: string, status: string }} ticket
 * @param {string} freelancerId
 * @returns {string | null}
 */
export function quoteRefusal(ticket, freelancerId) {
  if ([STATUS.ASSIGNED, STATUS.PAID, STATUS.COMPLETED].includes(ticket.status)) {
    return 'This order already has a freelancer — quotes are closed.';
  }
  if (ticket.status !== STATUS.OPEN) return 'This order is not accepting quotes.';
  const pending = get(
    "SELECT id FROM proposals WHERE ticket_id = ? AND freelancer_id = ? AND status = 'pending'",
    [ticket.id, freelancerId]
  );
  if (pending) return 'You already sent a quote for this order. Wait for the client to answer it.';
  return null;
}

/**
 * Accept a proposal: move the ticket open → assigned (with the freelancer) and mark the proposal.
 * The ticket transition goes first and decides: if the order is no longer open (another quote
 * was accepted a moment ago), nothing is written.
 * @param {string} proposalId
 * @param {string} ticketId
 * @param {string} freelancerId
 * @returns {boolean} true if accepted
 */
export function acceptProposal(proposalId, ticketId, freelancerId) {
  if (!transitionTicket(ticketId, STATUS.ASSIGNED, { assignedFreelancerId: freelancerId })) return false;
  run('UPDATE proposals SET status = ? WHERE id = ?', ['accepted', proposalId]);
  logger.info('Proposal accepted', { proposalId, ticketId, freelancerId });
  return true;
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
