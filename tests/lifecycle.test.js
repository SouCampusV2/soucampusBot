import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeChannel, fakeClient, fakeInteraction, answerKind } from './helpers/fakes.js';
import { handleMarkComplete } from '../src/interactions/handlers/markComplete.js';
import { handleDeclineOrder } from '../src/interactions/handlers/declineOrder.js';
import { handleConfirmPayment } from '../src/interactions/handlers/confirmPayment.js';
import { getTicketById } from '../src/modules/tickets/TicketRepository.js';

function setup(guildId, ticketOpts = {}) {
  const staff = fakeRole('Staff');
  const freelancerRole = fakeRole('Builders');
  const guild = fakeGuild({ id: guildId, roles: [staff, freelancerRole] });
  setSetting(guild.id, 'role_manager', staff.id);
  setSetting(guild.id, 'role_freelancer', freelancerRole.id);
  setSetting(guild.id, 'category_archived', 'archive-cat');
  const manager = fakeMember(guild, { roles: [staff], name: 'Boss' });
  const client = fakeMember(guild, { name: 'Alice' });
  const freelancer = fakeMember(guild, { roles: [freelancerRole], name: 'Bob' });
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({
    guildId: guild.id,
    clientId: client.id,
    clientChannelId: clientChannel.id,
    freelancerChannelId: quoteChannel.id,
    assignedFreelancerId: freelancer.id,
    ...ticketOpts,
  });
  return {
    guild, staff, freelancerRole, manager, client, freelancer, clientChannel, quoteChannel, ticketId,
    discord: fakeClient([clientChannel, quoteChannel]),
  };
}

test('a manager with a custom-named role can confirm payment', async () => {
  const s = setup('g-life-pay');
  const i = fakeInteraction({ client: s.discord, member: s.manager, guild: s.guild });
  await handleConfirmPayment(i, ['confirm_payment', s.ticketId]);
  assert.equal(answerKind(i), 'update');
  assert.equal(getTicketById(s.ticketId).payment_confirmed, 1);
  assert.equal(s.clientChannel.sent.length, 1, 'client was told');
  assert.equal(s.quoteChannel.sent.length, 2, 'quote channel got the notice and the Mark as Complete button');
});

test('the interaction is answered BEFORE the slow notifications go out', async () => {
  const s = setup('g-life-order');
  const i = fakeInteraction({ client: s.discord, member: s.manager, guild: s.guild });
  let answeredBeforeFirstSend = null;
  const send = s.clientChannel.send;
  s.clientChannel.send = async (p) => {
    answeredBeforeFirstSend ??= i.replied;
    return send(p);
  };
  await handleConfirmPayment(i, ['confirm_payment', s.ticketId]);
  assert.equal(answeredBeforeFirstSend, true);
});

test('a freelancer cannot confirm payment', async () => {
  const s = setup('g-life-pay-denied');
  const i = fakeInteraction({ client: s.discord, member: s.freelancer, guild: s.guild });
  await handleConfirmPayment(i, ['confirm_payment', s.ticketId]);
  assert.equal(answerKind(i), 'reply');
  assert.equal(getTicketById(s.ticketId).payment_confirmed, 0);
});

test('Mark as Complete makes the quote channel read-only for freelancers too', async () => {
  const s = setup('g-life-complete', { paid: true });
  const i = fakeInteraction({ client: s.discord, member: s.manager, guild: s.guild });
  await handleMarkComplete(i, ['mark_complete', s.ticketId]);

  assert.equal(s.quoteChannel.parentId, 'archive-cat');
  const lock = s.quoteChannel.overwrites.find((o) => o.target === s.freelancerRole.id);
  assert.ok(lock, 'freelancer role overwrite was edited');
  assert.equal(lock.perms.SendMessages, false);
});

test('Not Interested DM names the client', async () => {
  const s = setup('g-life-decline', { assignedFreelancerId: undefined });
  const i = fakeInteraction({ client: s.discord, member: s.freelancer, guild: s.guild, channel: s.quoteChannel });
  await handleDeclineOrder(i, ['decline_order', s.ticketId]);
  const dm = s.discord.dms.find((d) => d.to === s.freelancer.id);
  assert.ok(dm, 'freelancer got a DM');
  assert.match(dm.content, /Alice/);
});
