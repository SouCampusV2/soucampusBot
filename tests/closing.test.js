import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeChannel, fakeClient, fakeInteraction, answerKind } from './helpers/fakes.js';
import { handleCloseTicket } from '../src/interactions/handlers/closeTicket.js';
import { handleKeepChannel } from '../src/interactions/handlers/keepChannel.js';
import { sweepDueChannels } from '../src/jobs/cleanupJob.js';
import { createTicket, getTicketById } from '../src/modules/tickets/TicketRepository.js';
import { run } from '../src/core/Database.js';

function setup(guildId, ticketOpts = {}) {
  const staff = fakeRole('Staff');
  const builders = fakeRole('Builders');
  const guild = fakeGuild({ id: guildId, roles: [staff, builders] });
  setSetting(guild.id, 'role_manager', staff.id);
  setSetting(guild.id, 'role_freelancer', builders.id);
  setSetting(guild.id, 'category_archived', 'archive-cat');
  const manager = fakeMember(guild, { roles: [staff], name: 'Boss' });
  const client = fakeMember(guild, { name: 'Alice' });
  const stranger = fakeMember(guild, { name: 'Mallory' });
  const freelancer = fakeMember(guild, { roles: [builders], name: 'Bob' });
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({
    guildId: guild.id,
    clientId: client.id,
    clientChannelId: clientChannel.id,
    freelancerChannelId: quoteChannel.id,
    ...ticketOpts,
    ...(ticketOpts.assigned ? { assignedFreelancerId: freelancer.id } : {}),
  });
  const discord = fakeClient([clientChannel, quoteChannel]);
  return { guild, builders, manager, client, stranger, freelancer, clientChannel, quoteChannel, ticketId, discord };
}

const press = (s, member, handler, prefix) => {
  const i = fakeInteraction({ client: s.discord, member, guild: s.guild });
  return handler(i, [prefix, s.ticketId]).then(() => i);
};

test('a stranger cannot close someone else\'s ticket', async () => {
  const s = setup('g-close-stranger');
  const i = await press(s, s.stranger, handleCloseTicket, 'close_ticket');
  assert.equal(answerKind(i), 'reply');
  assert.equal(getTicketById(s.ticketId).status, 'open');
});

test('the client can cancel an order that has no freelancer yet', async () => {
  const s = setup('g-close-cancel');
  const i = await press(s, s.client, handleCloseTicket, 'close_ticket');
  assert.equal(answerKind(i), 'update');
  const t = getTicketById(s.ticketId);
  assert.equal(t.status, 'closed');
  assert.ok(t.channel_delete_at > Date.now() + 47 * 3600_000, 'deletion scheduled ~48h ahead');
  assert.equal(s.clientChannel.parentId, 'archive-cat');
  const clientLock = s.clientChannel.overwrites.find((o) => o.target === s.client.id);
  assert.equal(clientLock.perms.SendMessages, false, 'client can no longer write');
  const freelancerLock = s.quoteChannel.overwrites.find((o) => o.target === s.builders.id);
  assert.equal(freelancerLock?.perms.SendMessages, false, 'cancelled order: quote channel locked too');
});

test('the client cannot walk away from an order a freelancer is working on', async () => {
  const s = setup('g-close-assigned', { assigned: true });
  const i = await press(s, s.client, handleCloseTicket, 'close_ticket');
  assert.equal(answerKind(i), 'reply');
  assert.equal(getTicketById(s.ticketId).status, 'assigned');
});

test('a manager can close at any stage, and closing twice does nothing the second time', async () => {
  const s = setup('g-close-manager', { assigned: true, paid: true });
  const first = await press(s, s.manager, handleCloseTicket, 'close_ticket');
  assert.equal(answerKind(first), 'update');
  const sentAfterFirst = s.clientChannel.sent.length;
  const second = await press(s, s.manager, handleCloseTicket, 'close_ticket');
  assert.equal(answerKind(second), 'reply');
  assert.equal(s.clientChannel.sent.length, sentAfterFirst, 'no second "closed" message');
});

test('Keep archived (manager only) cancels the deletion', async () => {
  const s = setup('g-close-keep');
  await press(s, s.client, handleCloseTicket, 'close_ticket');

  const byClient = await press(s, s.client, handleKeepChannel, 'keep_channel');
  assert.equal(answerKind(byClient), 'reply');
  assert.ok(getTicketById(s.ticketId).channel_delete_at, 'client cannot keep it');

  await press(s, s.manager, handleKeepChannel, 'keep_channel');
  assert.equal(getTicketById(s.ticketId).channel_delete_at, null);
});

test('the sweeper deletes only channels whose time has come, and only once', async () => {
  const guild = fakeGuild({ id: 'g-sweep' });
  const due = fakeChannel(guild);
  const later = fakeChannel(guild);
  const make = (channel, at) => {
    const { id } = createTicket({ type: 'help', guildId: guild.id, clientId: 'c', clientChannelId: channel.id });
    run("UPDATE tickets SET status = 'closed', channel_delete_at = ? WHERE id = ?", [at, id]);
    return id;
  };
  const dueId = make(due, Date.now() - 1000);
  make(later, Date.now() + 3600_000);
  const discord = fakeClient([due, later]);

  assert.equal(await sweepDueChannels(discord), 1);
  assert.equal(due.deleted, true);
  assert.equal(later.deleted, false);
  assert.equal(getTicketById(dueId).channel_delete_at, null);
  assert.equal(await sweepDueChannels(discord), 0, 'nothing left to delete');
});

test('a channel someone already deleted by hand does not break the sweeper', async () => {
  const guild = fakeGuild({ id: 'g-sweep-gone' });
  const { id } = createTicket({ type: 'help', guildId: guild.id, clientId: 'c', clientChannelId: 'gone' });
  run("UPDATE tickets SET status = 'closed', channel_delete_at = ? WHERE id = ?", [Date.now() - 1, id]);
  await sweepDueChannels(fakeClient([]));
  assert.equal(getTicketById(id).channel_delete_at, null);
});
