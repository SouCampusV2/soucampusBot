import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerText, customIds } from './helpers/fakes.js';
import { handleTakeCommand } from '../src/commands/takeCommand.js';
import { getTicketById } from '../src/modules/tickets/TicketRepository.js';

function setup(guildId) {
  const guild = fakeGuild({ id: guildId });
  const client = fakeMember(guild);
  const manager = fakeMember(guild, { admin: true, name: 'Owner' });
  const stranger = fakeMember(guild, { name: 'Stranger' });
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, freelancerChannelId: quoteChannel.id });
  return { guild, client, manager, stranger, clientChannel, quoteChannel, ticketId, discord: fakeClient([clientChannel, quoteChannel]) };
}

function take(s, member, channel, options = { price: '€550' }) {
  const i = fakeInteraction({ client: s.discord, member, guild: s.guild, channel });
  i.channelId = channel.id;
  i.options = {
    getString: (name) => options[name] ?? null,
    getUser: (name) => options[name] ?? null,
  };
  return i;
}

test('/take: a stranger is refused and nothing changes', async () => {
  const s = setup('g-take-stranger');
  const i = take(s, s.stranger, s.clientChannel);
  await handleTakeCommand(i);
  assert.match(answerText(i), /only managers/i);
  assert.equal(getTicketById(s.ticketId).status, 'open');
  assert.equal(getTicketById(s.ticketId).assigned_freelancer_id, null);
});

test('/take: the client cannot assign their own order either', async () => {
  const s = setup('g-take-client');
  const i = take(s, s.client, s.clientChannel);
  await handleTakeCommand(i);
  assert.match(answerText(i), /only managers/i);
  assert.equal(getTicketById(s.ticketId).status, 'open');
});

test('/take: the manager becomes the builder, joins the client channel, payment button appears', async () => {
  const s = setup('g-take-ok');
  const i = take(s, s.manager, s.quoteChannel);
  await handleTakeCommand(i);
  const ticket = getTicketById(s.ticketId);
  assert.equal(ticket.status, 'assigned');
  assert.equal(ticket.assigned_freelancer_id, s.manager.id);
  assert.ok(s.clientChannel.overwrites.some((o) => o.target === s.manager.id && o.perms.ViewChannel));
  assert.ok(s.clientChannel.sent.some((m) => m.content?.includes(`<@${s.manager.id}>`)), 'client is told who builds');
  const payment = s.quoteChannel.sent.at(-1);
  assert.ok(customIds(payment).some((id) => id.startsWith('confirm_payment')), 'payment button posted');

  const again = take(s, s.manager, s.clientChannel);
  await handleTakeCommand(again);
  assert.match(answerText(again), /already has a builder/i);
});

test('/take: outside an order channel it explains where to run it', async () => {
  const s = setup('g-take-elsewhere');
  const i = take(s, s.manager, fakeChannel(s.guild));
  await handleTakeCommand(i);
  assert.match(answerText(i), /ticket channel/i);
});
