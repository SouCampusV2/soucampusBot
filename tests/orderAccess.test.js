import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind } from './helpers/fakes.js';
import { handleEditOrder } from '../src/interactions/handlers/editOrder.js';
import { handleEditOrderModal } from '../src/interactions/handlers/editOrderModal.js';
import { handleStartOrder, handleOrderForm1Modal, handleOrderForm2, handleOrderForm2Modal, handleOrderBudgetSelect } from '../src/modules/tickets/flows/OrderFlow.js';
import { getTicketFields, getTicketById } from '../src/modules/tickets/TicketRepository.js';

function setup(guildId) {
  const guild = fakeGuild({ id: guildId });
  const client = fakeMember(guild, { name: 'Alice' });
  const stranger = fakeMember(guild, { name: 'Mallory' });
  const clientChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id });
  return { guild, client, stranger, clientChannel, ticketId, discord: fakeClient([clientChannel]) };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });

test('the budget can be changed before submitting, not after', async () => {
  const guild = fakeGuild({ id: 'g-access-budget' });
  const client = fakeMember(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: fakeChannel(guild).id, inForm: true });
  const s = { guild, discord: fakeClient() };

  await handleOrderBudgetSelect(as(s, client, { values: ['100-500'] }), ['order_budget', ticketId]);
  await handleOrderBudgetSelect(as(s, client, { values: ['1000+'] }), ['order_budget', ticketId]);
  assert.equal(getTicketFields(ticketId).find((f) => f.field_name === 'budget').field_value, '1000+');
  assert.equal(getTicketById(ticketId).status, 'form', 'still not submitted');

  const submitted = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: fakeChannel(guild).id });
  const late = as(s, client, { values: ['<100'] });
  await handleOrderBudgetSelect(late, ['order_budget', submitted]);
  assert.equal(answerKind(late), 'reply');
});

test('only the client can open Edit Order', async () => {
  const s = setup('g-access-edit');
  const byStranger = as(s, s.stranger);
  await handleEditOrder(byStranger, ['edit_order', s.ticketId]);
  assert.equal(answerKind(byStranger), 'reply');

  const byClient = as(s, s.client);
  await handleEditOrder(byClient, ['edit_order', s.ticketId]);
  assert.equal(answerKind(byClient), 'showModal');
});

test('the Edit Order modal re-checks who submits it', async () => {
  const s = setup('g-access-edit-modal');
  const fields = { field_need: 'Hacked', field_deadline: '', field_reference_urls: '', field_size: '', field_theme: '' };
  await handleEditOrderModal(as(s, s.stranger, { fields }), ['edit_order_modal', s.ticketId]);
  const need = getTicketFields(s.ticketId).find((f) => f.field_name === 'need');
  assert.equal(need.field_value, 'A spawn castle');
});

test('only the client can fill the order form', async () => {
  const s = setup('g-access-form');
  const steps = [
    [handleStartOrder, 'start_order', {}],
    [handleOrderForm1Modal, 'order_form_1', { fields: { field_need: 'Hacked' } }],
    [handleOrderForm2, 'order_form_2', {}],
    [handleOrderForm2Modal, 'order_form_2_modal', { fields: { field_version: '1.20' } }],
    [handleOrderBudgetSelect, 'order_budget', { values: ['1000+'] }],
  ];
  for (const [handler, prefix, extra] of steps) {
    const i = as(s, s.stranger, extra);
    await handler(i, [prefix, s.ticketId]);
    assert.equal(answerKind(i), 'reply', `${prefix} must refuse a non-client`);
    assert.match(i.calls[0].payload.content, /only the client/i, `${prefix} refusal text`);
  }
  assert.equal(getTicketFields(s.ticketId).length, 1, 'nothing was written by the stranger');
});
