/**
 * Send Message conversations (STEP 6): a builder asks the client something before quoting.
 *
 * One conversation per order and builder, shown as ONE card in the client channel (client +
 * managers) and a copy in the quote channel — all builders of the order see the questions and
 * answers and do not ask the same twice (owner's decision 2026-10-26). Every new message edits
 * both cards in place. An edit notifies nobody, so the other side gets a short DM with a link.
 * For a longer talk the client opens a private thread with that builder (contact_freelancer).
 */

import { getTicketById } from '../tickets/TicketRepository.js';
import { STATUS } from '../tickets/TicketStatus.js';
import {
  getConversation,
  addConversationMessage,
  listConversationMessages,
  setConversationCards,
} from './ConversationRepository.js';
import { conversationCardPayload, ticketLabel } from '../../embeds/templates.js';
import { isManagerOrAdmin, getFreelancerRole } from '../../utils/permissions.js';
import { logger } from '../../utils/logger.js';

/**
 * Why this member may NOT start a conversation on this order, or null if they may.
 * @param {import('discord.js').GuildMember} member
 * @param {object | undefined} ticket
 * @returns {string | null}
 */
export function startRefusal(member, ticket) {
  if (ticket?.type !== 'order' || !ticket.client_channel_id) return 'Order not found.';
  if (ticket.status !== STATUS.OPEN) return 'This order is no longer open for questions.';
  if (member.id === ticket.client_id) return 'This is your own order.';
  const builderRole = member.guild ? getFreelancerRole(member.guild) : undefined;
  const isBuilder = builderRole ? member.roles?.cache?.has(builderRole.id) : false;
  if (!isBuilder && !isManagerOrAdmin(member)) return 'Only builders can message the client.';
  return null;
}

/**
 * Who this member is in the conversation: its client, its builder, or the team. null = outsider.
 * @returns {'client' | 'builder' | 'team' | null}
 */
export function speakerRole(member, ticket, conversation) {
  if (member.id === ticket.client_id) return 'client';
  if (member.id === conversation.freelancer_id) return 'builder';
  if (isManagerOrAdmin(member)) return 'team';
  return null;
}

/**
 * Save a message and redraw both cards. Slow (fetches, edits, a DM): call after defer.
 * @param {import('discord.js').Client} client
 * @param {number} conversationId
 * @param {{ authorId: string, authorName: string, authorRole: 'builder' | 'client' | 'team', content: string }} message
 */
export async function postConversationMessage(client, conversationId, message) {
  addConversationMessage(conversationId, message);
  const links = await syncConversationCards(client, conversationId);
  await notifyOtherSide(client, conversationId, message, links);
}

/**
 * Edit the cards in place, or post them the first time. Returns links to both.
 * @returns {Promise<{ client?: string, quote?: string }>}
 */
export async function syncConversationCards(client, conversationId) {
  const conversation = getConversation(conversationId);
  const ticket = getTicketById(conversation.ticket_id);
  const messages = listConversationMessages(conversationId);
  const sides = [
    ['client', ticket.client_channel_id, conversation.client_msg_id],
    ['quote', ticket.freelancer_channel_id, conversation.quote_msg_id],
  ];
  const ids = {};
  const links = {};
  for (const [side, channelId, messageId] of sides) {
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (!channel) continue;
    const payload = conversationCardPayload(ticket, conversation, messages, side);
    const existing = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
    const card = existing ? await existing.edit(payload) : await channel.send(payload);
    ids[side] = card.id;
    links[side] = `https://discord.com/channels/${ticket.guild_id}/${channel.id}/${card.id}`;
  }
  setConversationCards(conversationId, {
    clientMsgId: ids.client ?? conversation.client_msg_id,
    quoteMsgId: ids.quote ?? conversation.quote_msg_id,
  });
  return links;
}

/** Best-effort DM to the side that did not write; closed DMs are normal, the card is the record. */
async function notifyOtherSide(client, conversationId, message, links) {
  const conversation = getConversation(conversationId);
  const ticket = getTicketById(conversation.ticket_id);
  const toClient = message.authorRole !== 'client';
  const userId = toClient ? ticket.client_id : conversation.freelancer_id;
  const link = toClient ? links.client : links.quote;
  if (!link || userId === message.authorId) return;
  const text = toClient
    ? `💬 **${message.authorName}** wrote to you about your order ${ticketLabel(ticket)}: ${link}`
    : `💬 The client answered you on order ${ticketLabel(ticket)}: ${link}`;
  const user = await client.users.fetch(userId).catch(() => null);
  await user?.send(text).catch((err) => logger.debug('Conversation DM not delivered', { userId, error: err.message }));
}
