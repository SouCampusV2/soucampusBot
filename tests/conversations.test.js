import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeChannel, fakeClient, fakeInteraction, answerKind, answerText, customIds, payloadText } from './helpers/fakes.js';
import { handleSendMessage } from '../src/interactions/handlers/sendMessage.js';
import { handleSendMessageModal } from '../src/interactions/handlers/sendMessageModal.js';
import { handleReplyRelay } from '../src/interactions/handlers/replyRelay.js';
import { handleReplyRelayModal } from '../src/interactions/handlers/replyRelayModal.js';
import { handleContactFreelancer } from '../src/interactions/handlers/contactFreelancer.js';
import { listBuilderConversations, listConversationMessages } from '../src/modules/conversations/ConversationRepository.js';
import { createTicket, getTicketById } from '../src/modules/tickets/TicketRepository.js';

function setup(guildId) {
  const builders = fakeRole('Builders');
  const guild = fakeGuild({ id: guildId, roles: [builders] });
  setSetting(guild.id, 'role_freelancer', builders.id);
  const client = fakeMember(guild, { name: 'Alice' });
  const bob = fakeMember(guild, { roles: [builders], name: 'Bob' });
  const carol = fakeMember(guild, { roles: [builders], name: 'Carol' });
  const stranger = fakeMember(guild, { name: 'Mallory' });
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, freelancerChannelId: quoteChannel.id });
  const discord = fakeClient([clientChannel, quoteChannel]);
  return { guild, client, bob, carol, stranger, clientChannel, quoteChannel, ticketId, discord };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });
/** The builder's latest conversation (card) on this order. */
const findConversation = (ticketId, builderId) => listBuilderConversations(ticketId, builderId).at(-1);
const say = (text) => ({ fields: { message: text } });
const send = (s, member, text) => handleSendMessageModal(as(s, member, say(text)), ['send_message_modal', s.ticketId]);

test('only builders can start a conversation, and only while the order is open', async () => {
  const s = setup('g-conv-door');
  for (const member of [s.stranger, s.client]) {
    const i = as(s, member);
    await handleSendMessage(i, ['send_message', s.ticketId]);
    assert.equal(answerKind(i), 'reply');
  }
  const byStranger = as(s, s.stranger, say('spam'));
  await handleSendMessageModal(byStranger, ['send_message_modal', s.ticketId]);
  assert.equal(answerKind(byStranger), 'reply', 'the modal re-checks');
  assert.equal(s.clientChannel.sent.length, 0);

  const ok = as(s, s.bob);
  await handleSendMessage(ok, ['send_message', s.ticketId]);
  assert.equal(answerKind(ok), 'showModal');
});

test("a builder's message: one card in the client's ticket, its copy for the builders", async () => {
  const s = setup('g-conv-first');
  await send(s, s.bob, 'Which roof style?');
  assert.equal(s.clientChannel.sent.length, 1);
  assert.equal(s.quoteChannel.sent.length, 1);
  const [clientCard] = s.clientChannel.sent;
  assert.equal(clientCard.flags, MessageFlags.IsComponentsV2);
  assert.match(payloadText(clientCard), /Which roof style\?/);
  const conv = findConversation(s.ticketId, s.bob.id);
  assert.deepEqual(customIds(clientCard), [`reply_relay:${conv.id}`, `contact_freelancer:${s.ticketId}:${s.bob.id}`]);
  assert.deepEqual(customIds(s.quoteChannel.sent[0]), [`reply_relay:${conv.id}`], 'no thread button for builders');
  assert.ok(s.discord.dms.some((d) => d.to === s.client.id), 'the client is told by DM');
});

test("the client's reply is added to the SAME card on both sides, not posted anew", async () => {
  const s = setup('g-conv-reply');
  await send(s, s.bob, 'Which roof style?');
  const conv = findConversation(s.ticketId, s.bob.id);
  await handleReplyRelayModal(as(s, s.client, say('Dark oak')), ['reply_relay_modal', String(conv.id)]);

  assert.equal(s.clientChannel.sent.length, 1, 'no new message in the ticket');
  assert.equal(s.quoteChannel.sent.length, 1, 'no new message for the builders');
  const [clientCard] = [...s.clientChannel.posted.values()];
  const [quoteCard] = [...s.quoteChannel.posted.values()];
  for (const card of [clientCard, quoteCard]) {
    assert.match(payloadText(card), /Which roof style\?/);
    assert.match(payloadText(card), /Dark oak/);
  }
  assert.ok(s.discord.dms.some((d) => d.to === s.bob.id), 'the builder is told by DM');
  assert.deepEqual(listConversationMessages(conv.id).map((m) => m.author_role), ['builder', 'client']);
});

test('another builder cannot reply in Bob\'s conversation; a second builder gets their own card', async () => {
  const s = setup('g-conv-other');
  await send(s, s.bob, 'Which roof style?');
  const conv = findConversation(s.ticketId, s.bob.id);
  const button = as(s, s.carol);
  await handleReplyRelay(button, ['reply_relay', String(conv.id)]);
  assert.equal(answerKind(button), 'reply');
  const modal = as(s, s.carol, say('hijack'));
  await handleReplyRelayModal(modal, ['reply_relay_modal', String(conv.id)]);
  assert.match(answerText(modal), /only the client and this builder/i);
  assert.equal(listConversationMessages(conv.id).length, 1);

  await send(s, s.carol, 'Do you need a lobby?');
  assert.equal(s.clientChannel.sent.length, 2, 'a separate card per builder');
});

test('a manager or admin who is not this builder cannot reply either', async () => {
  const s = setup('g-conv-admin');
  await send(s, s.bob, 'Which roof style?');
  const conv = findConversation(s.ticketId, s.bob.id);
  const admin = fakeMember(s.guild, { admin: true, name: 'Owner' });
  const i = as(s, admin, say('as admin'));
  await handleReplyRelayModal(i, ['reply_relay_modal', String(conv.id)]);
  assert.match(answerText(i), /only the client and this builder/i);
  assert.equal(listConversationMessages(conv.id).length, 1);
});

test('every Send Message is a new card; Reply adds to the card it was pressed on', async () => {
  const s = setup('g-conv-again');
  await send(s, s.bob, 'Which roof style?');
  await send(s, s.bob, 'And the terrain?');
  assert.equal(s.clientChannel.sent.length, 2, 'two cards for the client');
  assert.equal(s.quoteChannel.sent.length, 2, 'two copies for the builders');
  const [first, second] = listBuilderConversations(s.ticketId, s.bob.id);
  await handleReplyRelayModal(as(s, s.client, say('Flat')), ['reply_relay_modal', String(first.id)]);
  assert.deepEqual(listConversationMessages(first.id).map((m) => m.content), ['Which roof style?', 'Flat']);
  assert.deepEqual(listConversationMessages(second.id).map((m) => m.content), ['And the terrain?']);
  assert.equal(s.clientChannel.sent.length, 2, 'the reply edited a card, no new message');
});

test('a Reply button from the old relay (ticket id in the customId) explains instead of crashing', async () => {
  const s = setup('g-conv-legacy');
  const i = as(s, s.client);
  await handleReplyRelay(i, ['reply_relay', s.ticketId]);
  assert.match(answerText(i), /older version/);
});

test('Open private thread: only the client, and one thread per builder', async () => {
  const s = setup('g-conv-thread');
  let created = 0;
  const thread = { id: 'thread-1', archived: false, members: { add: async () => {} }, send: async () => {} };
  s.clientChannel.threads = { create: async () => (created++, thread) };
  s.discord.channels.fetch = async (id) => ({ [s.clientChannel.id]: s.clientChannel, [s.quoteChannel.id]: s.quoteChannel, 'thread-1': thread })[id] ?? null;

  const byBuilder = as(s, s.carol);
  await handleContactFreelancer(byBuilder, ['contact_freelancer', s.ticketId, s.bob.id]);
  assert.equal(answerKind(byBuilder), 'reply');

  await handleContactFreelancer(as(s, s.client), ['contact_freelancer', s.ticketId, s.bob.id]);
  await handleContactFreelancer(as(s, s.client), ['contact_freelancer', s.ticketId, s.bob.id]);
  assert.equal(created, 1, 'the second press leads to the same thread');
});

test('Open private thread: the builder can read the ticket first, so Discord lets them into the thread', async () => {
  const s = setup('g-conv-thread-access');
  const order = [];
  const thread = {
    id: 'thread-2',
    archived: false,
    members: { add: async (id) => order.push(`add:${id}`) },
    send: async () => {},
  };
  s.clientChannel.threads = { create: async () => thread };
  const edit = s.clientChannel.permissionOverwrites.edit;
  s.clientChannel.permissionOverwrites.edit = async (target, perms) => {
    order.push(`perm:${target}`);
    return edit(target, perms);
  };
  s.discord.channels.fetch = async (id) => ({ [s.clientChannel.id]: s.clientChannel, 'thread-2': thread })[id] ?? null;

  await handleContactFreelancer(as(s, s.client), ['contact_freelancer', s.ticketId, s.bob.id]);
  assert.deepEqual(order, [`perm:${s.bob.id}`, `add:${s.bob.id}`], 'access before adding (Discord: Missing Access otherwise)');
  const grant = s.clientChannel.overwrites.find((o) => o.target === s.bob.id).perms;
  assert.equal(grant.ViewChannel, true);
  assert.equal(grant.SendMessages, false, 'reads the ticket, writes only in the thread');
  assert.equal(grant.SendMessagesInThreads, true);

  // A thread made before this fix: pressing again adds the builder to it.
  order.length = 0;
  await handleContactFreelancer(as(s, s.client), ['contact_freelancer', s.ticketId, s.bob.id]);
  assert.deepEqual(order, [`perm:${s.bob.id}`, `add:${s.bob.id}`]);
});

test('tickets are numbered per server: #1, #2 … independent between servers', () => {
  const open = (guildId) => getTicketById(createTicket({ type: 'help', guildId, clientId: 'c', clientChannelId: null }).id).number;
  assert.deepEqual([open('g-num-a'), open('g-num-a'), open('g-num-b'), open('g-num-a')], [1, 2, 1, 3]);
});
