/**
 * In-memory store of last relay message IDs per ticket (client channel + freelancer channel).
 * Used so replies are sent as Discord "reply" under the original message in both channels.
 */

const relayLastMessageIds = new Map();

/**
 * @param {string} ticketId
 * @param {{ clientMsgId: string, freelancerMsgId: string }} ids
 */
export function setRelayMessageIds(ticketId, ids) {
  relayLastMessageIds.set(ticketId, ids);
}

/**
 * @param {string} ticketId
 * @returns {{ clientMsgId: string, freelancerMsgId: string } | undefined}
 */
export function getRelayMessageIds(ticketId) {
  return relayLastMessageIds.get(ticketId);
}
