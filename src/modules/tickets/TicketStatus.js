/**
 * Ticket lifecycle — the ONE place that knows which stage a ticket is in and where it may go next.
 *
 * `tickets.status` is the source of truth. The older flags (payment_confirmed, completed) are still
 * written by transitionTicket so a rollback to older code reads the same database, but nothing
 * reads them anymore. New stage logic = a row in TRANSITIONS, not another flag or another check
 * scattered in a handler.
 */

import { run, get } from '../../core/Database.js';
import { logger } from '../../utils/logger.js';

export const STATUS = {
  FORM: 'form', // order: client is filling the form
  OPEN: 'open', // order: summary done, collecting quotes / help & application: in progress
  ASSIGNED: 'assigned', // order: client accepted a quote
  PAID: 'paid', // order: manager confirmed payment
  COMPLETED: 'completed', // order: manager marked the work done, review pending
  ACCEPTED: 'accepted', // application: applicant accepted into the team
  REJECTED: 'rejected', // application: applicant rejected
  CLOSED: 'closed', // any type: channel archived, scheduled for deletion
};

/** type -> target status -> statuses it may be reached from. */
const TRANSITIONS = {
  order: {
    [STATUS.OPEN]: [STATUS.FORM],
    [STATUS.ASSIGNED]: [STATUS.OPEN],
    [STATUS.PAID]: [STATUS.ASSIGNED],
    [STATUS.COMPLETED]: [STATUS.PAID],
    [STATUS.CLOSED]: [STATUS.FORM, STATUS.OPEN, STATUS.ASSIGNED, STATUS.PAID, STATUS.COMPLETED],
  },
  help: {
    [STATUS.CLOSED]: [STATUS.OPEN],
  },
  application: {
    [STATUS.ACCEPTED]: [STATUS.OPEN],
    [STATUS.REJECTED]: [STATUS.OPEN],
    [STATUS.CLOSED]: [STATUS.OPEN, STATUS.ACCEPTED, STATUS.REJECTED],
  },
};

/** Columns written alongside a status change (legacy flags + data that belongs to the step). */
const SIDE_EFFECTS = {
  [STATUS.ASSIGNED]: (extra) => ({ assigned_freelancer_id: extra.assignedFreelancerId }),
  [STATUS.PAID]: () => ({ payment_confirmed: 1 }),
  [STATUS.COMPLETED]: () => ({ completed: 1 }),
};

/**
 * @param {string} type
 * @returns {string}
 */
export function initialStatus(type) {
  return type === 'order' ? STATUS.FORM : STATUS.OPEN;
}

/**
 * Statuses a ticket of `type` may move to `to` from (empty if the move does not exist).
 * @param {string} type
 * @param {string} to
 * @returns {string[]}
 */
export function allowedFrom(type, to) {
  return TRANSITIONS[type]?.[to] ?? [];
}

/**
 * Move a ticket to `to` if the lifecycle allows it from its current status.
 * Check and write are ONE conditional UPDATE, so two simultaneous clicks cannot both succeed.
 * @param {string} ticketId
 * @param {string} to - a STATUS value
 * @param {{ assignedFreelancerId?: string }} [extra]
 * @returns {boolean} true if the ticket moved
 */
export function transitionTicket(ticketId, to, extra = {}) {
  const ticket = get('SELECT type, status FROM tickets WHERE id = ?', [ticketId]);
  if (!ticket) return false;
  const from = allowedFrom(ticket.type, to);
  if (!from.length) return false;

  const columns = { status: to, ...(SIDE_EFFECTS[to]?.(extra) ?? {}) };
  const setSql = Object.keys(columns).map((c) => `${c} = ?`).join(', ');
  const placeholders = from.map(() => '?').join(', ');
  const { changes } = run(
    `UPDATE tickets SET ${setSql} WHERE id = ? AND status IN (${placeholders})`,
    [...Object.values(columns), ticketId, ...from]
  );
  if (changes === 1) {
    logger.info('Ticket status changed', { ticketId, from: ticket.status, to });
    return true;
  }
  return false;
}

/** Stages in which the CLIENT may close their own ticket. Managers may close at any stage. */
const CLIENT_CLOSABLE = {
  // Before a freelancer is picked = cancelling; after completion = done. In between a freelancer
  // is working (and may have been paid) — walking away then is a manager's call.
  order: [STATUS.FORM, STATUS.OPEN, STATUS.COMPLETED],
  help: [STATUS.OPEN],
  application: [STATUS.OPEN, STATUS.ACCEPTED, STATUS.REJECTED],
};

/**
 * Why this user may NOT close the ticket, or null if they may.
 * @param {{ type: string, status: string, client_id: string }} ticket
 * @param {string} userId
 * @param {boolean} isManager
 * @returns {string | null}
 */
export function closeRefusal(ticket, userId, isManager) {
  if (ticket.status === STATUS.CLOSED) return 'This ticket is already closed.';
  if (isManager) return null;
  if (ticket.client_id !== userId) return 'Only the ticket owner or a manager can close this ticket.';
  if (!(CLIENT_CLOSABLE[ticket.type] ?? []).includes(ticket.status)) {
    return 'A freelancer is working on this order — ask a manager to close it.';
  }
  return null;
}

/**
 * Migration helper: derive `status` for tickets created before the column existed.
 * Takes the db handle because it runs inside initDatabase, before getDatabase() is usable.
 * @param {import('better-sqlite3').Database} db
 */
export function backfillStatus(db) {
  const { changes } = db
    .prepare(
      `UPDATE tickets SET status = CASE
         WHEN completed = 1 THEN 'completed'
         WHEN payment_confirmed = 1 THEN 'paid'
         WHEN assigned_freelancer_id IS NOT NULL THEN 'assigned'
         WHEN type = 'order' AND EXISTS (
           SELECT 1 FROM ticket_fields f WHERE f.ticket_id = tickets.id AND f.field_name = 'budget'
         ) THEN 'open'
         WHEN type = 'order' THEN 'form'
         ELSE 'open'
       END
       WHERE status IS NULL`
    )
    .run();
  if (changes) logger.info('Migration: backfilled ticket status', { tickets: changes });
}
