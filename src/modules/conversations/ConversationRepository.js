/**
 * Builder ↔ client conversations before a quote: every Send Message starts one (one card),
 * replies are its messages. The cards are drawn from these rows (Conversation.js). The private
 * thread is per builder: its id is kept on all of that builder's rows for the order.
 */

import { get, query, run } from '../../core/Database.js';

/**
 * A new conversation (a new card) for this builder's Send Message.
 * @param {string} ticketId
 * @param {string} freelancerId
 */
export function createConversation(ticketId, freelancerId) {
  const { lastInsertRowid } = run('INSERT INTO conversations (ticket_id, freelancer_id) VALUES (?, ?)', [ticketId, freelancerId]);
  return getConversation(lastInsertRowid);
}

/** This builder's conversations on this order, oldest first. */
export function listBuilderConversations(ticketId, freelancerId) {
  return query('SELECT * FROM conversations WHERE ticket_id = ? AND freelancer_id = ? ORDER BY id', [ticketId, freelancerId]);
}

/** The private thread of this builder on this order, if one was opened. */
export function findBuilderThreadId(ticketId, freelancerId) {
  return get(
    'SELECT thread_id FROM conversations WHERE ticket_id = ? AND freelancer_id = ? AND thread_id IS NOT NULL LIMIT 1',
    [ticketId, freelancerId]
  )?.thread_id;
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

/**
 * Remember the builder's private thread on all their rows; a builder who never wrote (thread
 * opened from a quote's Contact freelancer) gets a row without a card just to hold it.
 */
export function rememberBuilderThread(ticketId, freelancerId, threadId) {
  const { changes } = run('UPDATE conversations SET thread_id = ? WHERE ticket_id = ? AND freelancer_id = ?', [
    threadId,
    ticketId,
    freelancerId,
  ]);
  if (!changes) {
    run('INSERT INTO conversations (ticket_id, freelancer_id, thread_id) VALUES (?, ?, ?)', [ticketId, freelancerId, threadId]);
  }
}
