import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind } from './helpers/fakes.js';
import { handleEditOrder } from '../src/interactions/handlers/editOrder.js';
import { handleEditOrderModal } from '../src/interactions/handlers/editOrderModal.js';
import { handleStartOrderButton } from '../src/interactions/handlers/startOrder.js';
import { handleOrderFinish, handleOrderFinishModal } from '../src/modules/tickets/flows/OrderFlow.js';
import { getTicketFields } from '../src/modules/tickets/TicketRepository.js';

function setup(guildId, opts = {}) {
  const guild = fakeGuild({ id: guildId });
  const client = fakeMember(guild, { name: 'Alice' });
  const stranger = fakeMember(guild, { name: 'Mallory' });
  const clientChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, ...opts });
  return { guild, client, stranger, clientChannel, ticketId, discord: fakeClient([clientChannel]) };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });
const BRIEF = { fields: { field_need: 'Hacked', field_size: '1x1', field_theme: 'x', field_budget: '' } };
const FINISH = { selects: { field_version: ['bedrock'] }, fields: { field_deadline: '01.01.2027' } };

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
  await handleEditOrderModal(as(s, s.stranger, BRIEF), ['edit_order_modal', s.ticketId]);
  const need = getTicketFields(s.ticketId).find((f) => f.field_name === 'need');
  assert.equal(need.field_value, 'A spawn castle');
});

test('only the client can fill the order form', async () => {
  const s = setup('g-access-form', { inForm: true });
  const steps = [
    [handleStartOrderButton, 'start_order', {}],
    [handleEditOrderModal, 'edit_order_modal', BRIEF],
    [handleOrderFinish, 'order_finish', {}],
    [handleOrderFinishModal, 'order_finish_modal', FINISH],
  ];
  for (const [handler, prefix, extra] of steps) {
    const i = as(s, s.stranger, extra);
    await handler(i, [prefix, s.ticketId]);
    assert.equal(answerKind(i), 'reply', `${prefix} must refuse a non-client`);
    assert.match(i.calls[0].payload.content, /only the client/i, `${prefix} refusal text`);
  }
  assert.equal(getTicketFields(s.ticketId).length, 1, 'nothing was written by the stranger');
});

test('version and deadline cannot be changed once a freelancer took the order', async () => {
  const s = setup('g-access-finish-locked', { assignedFreelancerId: 'f1' });
  const i = as(s, s.client, FINISH);
  await handleOrderFinishModal(i, ['order_finish_modal', s.ticketId]);
  assert.match(i.calls[0].payload.content, /no longer be edited/);
  assert.ok(!getTicketFields(s.ticketId).some((f) => f.field_name === 'version'));
});
