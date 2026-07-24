/**
 * Store of last relay message IDs per ticket (client channel + freelancer channel),
 * used so replies are sent as Discord "reply" under the original message in both channels.
 *
 * Backed by the tickets table so it survives bot restarts (STEP 6).
 */

import { setRelayMessageIdsDb, getRelayMessageIdsDb } from '../modules/tickets/TicketRepository.js';

/**
 * @param {string} ticketId
 * @param {{ clientMsgId: string, freelancerMsgId: string }} ids
 */
export function setRelayMessageIds(ticketId, ids) {
  setRelayMessageIdsDb(ticketId, ids);
}

/**
 * @param {string} ticketId
 * @returns {{ clientMsgId: string, freelancerMsgId: string } | undefined}
 */
export function getRelayMessageIds(ticketId) {
  return getRelayMessageIdsDb(ticketId);
}
