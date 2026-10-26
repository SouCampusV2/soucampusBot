import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import { seedOrder, setSetting } from './helpers/db.js';
import {
  fakeGuild,
  fakeMember,
  fakeChannel,
  fakeClient,
  fakeInteraction,
  answerKind,
  answerText,
  customIds,
  findComponent,
  payloadText,
} from './helpers/fakes.js';
import { handleOrderFinishModal, handleSubmitOrder } from '../src/modules/tickets/flows/OrderFlow.js';
import { handleEditOrder } from '../src/interactions/handlers/editOrder.js';
import { getTicketById, getTicketFields, saveTicketField } from '../src/modules/tickets/TicketRepository.js';

/** What the order modal from the panel leaves behind: the brief without version and deadline. */
const BRIEF = { size: '150x150', theme: 'Medieval' };
const FINISH = { selects: { field_version: ['1.21'] }, fields: { field_deadline: '25.12.2026', field_extra_details: 'Needs a parkour' } };

function setup(guildId, fields = BRIEF) {
  const guild = fakeGuild({ id: guildId });
  setSetting(guild.id, 'category_quotes', 'quotes-cat');
  const client = fakeMember(guild, { name: 'Alice' });
  const clientChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, inForm: true, fields });
  return { guild, client, clientChannel, ticketId, discord: fakeClient([clientChannel]) };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });
const finish = (s) => handleOrderFinishModal(as(s, s.client, FINISH), ['order_finish_modal', s.ticketId]);

test('Version & deadline completes the brief and redraws the summary card in place', async () => {
  const s = setup('g-submit-finish');
  const i = as(s, s.client, FINISH);
  await handleOrderFinishModal(i, ['order_finish_modal', s.ticketId]);
  assert.equal(answerKind(i), 'update', 'the card is edited, not a new message');
  const card = i.calls[0].payload;
  assert.equal(card.flags, MessageFlags.IsComponentsV2);
  assert.equal(findComponent(card, `submit_order:${s.ticketId}`).disabled, false, 'Submit is enabled now');
  assert.match(payloadText(card), /Java 1\.21/);
  assert.match(payloadText(card), /Needs a parkour/);
  assert.equal(getTicketById(s.ticketId).deadline, '2026-12-25', 'the deadline is read as a date');
  assert.equal(getTicketById(s.ticketId).status, 'form');
  assert.equal(s.guild.createdChannels.length, 0, 'nothing goes to freelancers before Submit');
});

test('an unreadable deadline is saved but warned about', async () => {
  const s = setup('g-submit-baddate');
  const i = as(s, s.client, { ...FINISH, fields: { field_deadline: 'soonish' } });
  await handleOrderFinishModal(i, ['order_finish_modal', s.ticketId]);
  assert.match(i.calls.at(-1).payload.content, /could not read "soonish"/);
});

test('Edit order works before submitting', async () => {
  const s = setup('g-submit-edit');
  const edit = as(s, s.client);
  await handleEditOrder(edit, ['edit_order', s.ticketId]);
  assert.equal(answerKind(edit), 'showModal');
});

test('Submit with a required answer missing is refused and names what is missing', async () => {
  const s = setup('g-submit-missing', { size: '150x150', theme: '' });
  saveTicketField(s.ticketId, 'version', '1.21');
  const i = as(s, s.client);
  await handleSubmitOrder(i, ['submit_order', s.ticketId]);
  assert.equal(answerKind(i), 'reply');
  assert.match(answerText(i), /Style/);
  assert.match(answerText(i), /Deadline/);
  assert.equal(getTicketById(s.ticketId).status, 'form');
});

test('budget is optional: a brief without it can be submitted', async () => {
  const s = setup('g-submit-nobudget');
  await finish(s);
  const i = as(s, s.client);
  await handleSubmitOrder(i, ['submit_order', s.ticketId]);
  assert.equal(getTicketById(s.ticketId).status, 'open');
});

test('only the client can submit', async () => {
  const s = setup('g-submit-door');
  await finish(s);
  const i = as(s, fakeMember(s.guild));
  await handleSubmitOrder(i, ['submit_order', s.ticketId]);
  assert.match(answerText(i), /only the client/i);
  assert.equal(getTicketById(s.ticketId).status, 'form');
});

test('Submit opens the order to freelancers right away, exactly once', async () => {
  const s = setup('g-submit-ok');
  await finish(s);
  const i = as(s, s.client);
  await handleSubmitOrder(i, ['submit_order', s.ticketId]);
  assert.equal(answerKind(i), 'update');
  assert.deepEqual(customIds(i.calls[0].payload), [`order_finish:${s.ticketId}`, `edit_order:${s.ticketId}`], 'Submit is gone, edits stay');
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

test('the quote channel gets the brief with its buttons, then the reference files', async () => {
  const s = setup('g-submit-refs');
  const refs = await s.clientChannel.send({ content: 'refs', files: [{ attachment: 'https://cdn/a.png', name: 'a.png' }] });
  saveTicketField(s.ticketId, 'reference_msgs', refs.id);
  await finish(s);
  await handleSubmitOrder(as(s, s.client), ['submit_order', s.ticketId]);

  const [brief, files] = s.guild.createdChannels[0].sent;
  assert.equal(brief.flags, MessageFlags.IsComponentsV2);
  assert.match(payloadText(brief), new RegExp(`<@${s.client.id}>`), 'freelancers see the client (owner decision 2026-10-27)');
  assert.deepEqual(customIds(brief).sort(), [`decline_order:${s.ticketId}`, `send_message:${s.ticketId}`, `submit_quote:${s.ticketId}`].sort());
  assert.deepEqual(files.files, [{ attachment: 'https://cdn/a.png', name: 'a.png' }]);
  assert.ok(getTicketFields(s.ticketId).some((f) => f.field_name === 'reference_msgs'));
});
