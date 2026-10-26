/**
 * Builder ↔ client conversations before a quote (Send Message): one per order and builder,
 * with its messages. The cards that show them are drawn from these rows (Conversation.js).
 */

import { get, query, run } from '../../core/Database.js';

/**
 * The conversation of this builder on this order, created on first use. Synchronous: a double
 * submit cannot create two (UNIQUE ticket_id + freelancer_id backs it up).
 * @param {string} ticketId
 * @param {string} freelancerId
 */
export function getOrCreateConversation(ticketId, freelancerId) {
  run('INSERT OR IGNORE INTO conversations (ticket_id, freelancer_id) VALUES (?, ?)', [ticketId, freelancerId]);
  return findConversation(ticketId, freelancerId);
}

/** @returns {object | undefined} */
export function findConversation(ticketId, freelancerId) {
  return get('SELECT * FROM conversations WHERE ticket_id = ? AND freelancer_id = ?', [ticketId, freelancerId]);
}

/** @returns {object | undefined} */
export function getConversation(id) {
  return get('SELECT * FROM conversations WHERE id = ?', [Number(id)]);
}

/**
 * @param {number} conversationId
 * @param {{ authorId: string, authorName: string, authorRole: 'builder' | 'client' | 'team', content: string }} message
 */
export function addConversationMessage(conversationId, { authorId, authorName, authorRole, content }) {
  run(
    'INSERT INTO conversation_messages (conversation_id, author_id, author_name, author_role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [conversationId, authorId, authorName, authorRole, content, Date.now()]
  );
}

/** Messages oldest first. */
export function listConversationMessages(conversationId) {
  return query('SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY id', [conversationId]);
}

/** Remember where the cards are, so the next message edits them instead of posting new ones. */
export function setConversationCards(conversationId, { clientMsgId, quoteMsgId }) {
  run('UPDATE conversations SET client_msg_id = ?, quote_msg_id = ? WHERE id = ?', [clientMsgId, quoteMsgId, conversationId]);
}

export function setConversationThread(conversationId, threadId) {
  run('UPDATE conversations SET thread_id = ? WHERE id = ?', [threadId, conversationId]);
}
