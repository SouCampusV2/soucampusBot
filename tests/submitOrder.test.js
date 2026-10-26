import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind, answerText } from './helpers/fakes.js';
import { handleOrderBudgetSelect, handleSubmitOrder } from '../src/modules/tickets/flows/OrderFlow.js';
import { handleEditOrder } from '../src/interactions/handlers/editOrder.js';
import { getTicketById } from '../src/modules/tickets/TicketRepository.js';

const FULL = { size: '150x150', theme: 'Medieval', version: '1.21', deadline: '25.12.2026' };

function setup(guildId, fields = FULL) {
  const guild = fakeGuild({ id: guildId });
  setSetting(guild.id, 'category_quotes', 'quotes-cat');
  const client = fakeMember(guild, { name: 'Alice' });
  const clientChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, inForm: true, fields });
  return { guild, client, clientChannel, ticketId, discord: fakeClient([clientChannel]) };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });
const buttonIds = (payload) => payload.components.flatMap((row) => row.components.map((c) => c.data.custom_id));

test('picking the budget shows the summary with Submit — nothing goes to freelancers yet', async () => {
  const s = setup('g-submit-budget');
  const i = as(s, s.client, { values: ['100-500'] });
  await handleOrderBudgetSelect(i, ['order_budget', s.ticketId]);
  assert.equal(answerKind(i), 'update');
  assert.deepEqual(buttonIds(i.calls[0].payload).sort(), [`edit_order:${s.ticketId}`, `submit_order:${s.ticketId}`].sort());
  assert.equal(getTicketById(s.ticketId).status, 'form');
  assert.equal(s.guild.createdChannels.length, 0, 'no quote channel, no 60-second timer');
});

test('Edit Order works before submitting', async () => {
  const s = setup('g-submit-edit');
  await handleOrderBudgetSelect(as(s, s.client, { values: ['100-500'] }), ['order_budget', s.ticketId]);
  const edit = as(s, s.client);
  await handleEditOrder(edit, ['edit_order', s.ticketId]);
  assert.equal(answerKind(edit), 'showModal');
});

test('Submit with a required answer missing is refused and names what is missing', async () => {
  const s = setup('g-submit-missing', { size: '150x150', theme: '', version: '1.21' });
  await handleOrderBudgetSelect(as(s, s.client, { values: ['100-500'] }), ['order_budget', s.ticketId]);
  const i = as(s, s.client);
  await handleSubmitOrder(i, ['submit_order', s.ticketId]);
  assert.equal(answerKind(i), 'reply');
  assert.match(answerText(i), /Theme/);
  assert.match(answerText(i), /deadline/i);
  assert.equal(getTicketById(s.ticketId).status, 'form');
});

test('only the client can submit', async () => {
  const s = setup('g-submit-door');
  await handleOrderBudgetSelect(as(s, s.client, { values: ['100-500'] }), ['order_budget', s.ticketId]);
  const i = as(s, fakeMember(s.guild));
  await handleSubmitOrder(i, ['submit_order', s.ticketId]);
  assert.match(answerText(i), /only the client/i);
  assert.equal(getTicketById(s.ticketId).status, 'form');
});

test('Submit opens the order to freelancers right away, exactly once', async () => {
  const s = setup('g-submit-ok');
  await handleOrderBudgetSelect(as(s, s.client, { values: ['100-500'] }), ['order_budget', s.ticketId]);
  const i = as(s, s.client);
  await handleSubmitOrder(i, ['submit_order', s.ticketId]);
  assert.equal(answerKind(i), 'update');
  assert.deepEqual(buttonIds(i.calls[0].payload), [`edit_order:${s.ticketId}`], 'Submit is gone, Edit stays');
  const t = getTicketById(s.ticketId);
  assert.equal(t.status, 'open');
  assert.equal(s.guild.createdChannels.length, 1);
  assert.equal(s.guild.createdChannels[0].parentId, 'quotes-cat');
  assert.equal(t.freelancer_channel_id, s.guild.createdChannels[0].id);

  const again = as(s, s.client);
  await handleSubmitOrder(again, ['submit_order', s.ticketId]);
  assert.equal(answerKind(again), 'reply');
  assert.equal(s.guild.createdChannels.length, 1, 'no second quote channel');
});
