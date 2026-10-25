import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction } from './helpers/fakes.js';
import { handleSubmitQuoteModal } from '../src/interactions/handlers/submitQuoteModal.js';
import { handleDeclineOrder } from '../src/interactions/handlers/declineOrder.js';
import { handleEditOrderModal } from '../src/interactions/handlers/editOrderModal.js';

const QUOTE = { quote_deadline: '2026-12-01', quote_price: '€300', quote_message: 'Hi' };

function setup(guildId) {
  const guild = fakeGuild({ id: guildId });
  const client = fakeMember(guild, { name: 'Alice' });
  const [a, b, c] = ['A', 'B', 'C'].map((name) => fakeMember(guild, { name }));
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({
    guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, freelancerChannelId: quoteChannel.id,
  });
  return { guild, client, a, b, c, clientChannel, quoteChannel, ticketId, discord: fakeClient([clientChannel, quoteChannel]) };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });

test('the client sees one live counter of quotes and declines', async () => {
  const s = setup('g-counter');
  await handleSubmitQuoteModal(as(s, s.a, { fields: QUOTE }), ['submit_quote_modal', s.ticketId]);
  await handleSubmitQuoteModal(as(s, s.b, { fields: QUOTE }), ['submit_quote_modal', s.ticketId]);
  await handleDeclineOrder(as(s, s.c, { channel: s.quoteChannel }), ['decline_order', s.ticketId]);

  const counters = [...s.clientChannel.posted.values()].filter((m) => /quote/i.test(m.content ?? '') && /📊/.test(m.content ?? ''));
  assert.equal(counters.length, 1, 'one counter message, edited in place');
  assert.match(counters[0].content, /2 quotes received/);
  assert.match(counters[0].content, /1 freelancer not interested/);
});

test('the same freelancer declining twice is counted once', async () => {
  const s = setup('g-counter-dup');
  await handleDeclineOrder(as(s, s.c, { channel: s.quoteChannel }), ['decline_order', s.ticketId]);
  await handleDeclineOrder(as(s, s.c, { channel: s.quoteChannel }), ['decline_order', s.ticketId]);
  const counter = [...s.clientChannel.posted.values()].find((m) => /📊/.test(m.content ?? ''));
  assert.match(counter.content, /1 freelancer not interested/);
});

test('once a freelancer took the order, the client can no longer edit it', async () => {
  const guild = fakeGuild({ id: 'g-edit-locked' });
  const client = fakeMember(guild);
  const clientChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, assignedFreelancerId: 'f' });
  const s = { guild, discord: fakeClient([clientChannel]) };
  const fields = { field_need: 'Changed after pricing' };
  const i = as(s, client, { fields });
  await handleEditOrderModal(i, ['edit_order_modal', ticketId]);
  assert.match(i.calls[0].payload.content, /no longer be edited/);
  assert.equal(clientChannel.sent.length, 0);
});

test('editing the order after the quote channel exists tells the freelancers', async () => {
  const s = setup('g-edit-propagate');
  const fields = { field_need: 'A bigger castle', field_deadline: '', field_reference_urls: '', field_size: '300x300', field_theme: '' };
  await handleEditOrderModal(as(s, s.client, { fields }), ['edit_order_modal', s.ticketId]);
  const update = s.quoteChannel.sent.at(-1);
  assert.match(update.content, /updated the order/i);
  assert.match(JSON.stringify(update.embeds[0].data), /A bigger castle/);
  assert.doesNotMatch(JSON.stringify(update.embeds[0].data), /Alice/, 'still no client name for freelancers');
});
