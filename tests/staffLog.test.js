import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeChannel, fakeClient } from './helpers/fakes.js';
import { attachStaffLog } from '../src/modules/tickets/StaffLog.js';
import { createTicket } from '../src/modules/tickets/TicketRepository.js';
import { STATUS, transitionTicket } from '../src/modules/tickets/TicketStatus.js';
import { ticketEvents } from '../src/modules/tickets/events.js';

const settle = async () => {
  await tick();
  await tick();
};

test('ticket events land in the server\'s log channel, one line each', async () => {
  const guild = fakeGuild({ id: 'g-log' });
  const logChannel = fakeChannel(guild);
  setSetting(guild.id, 'channel_log', logChannel.id);
  const detach = attachStaffLog(fakeClient([logChannel]));
  try {
    const { id } = createTicket({ type: 'order', guildId: guild.id, clientId: 'alice', clientChannelId: 'ch-log' });
    transitionTicket(id, STATUS.OPEN);
    ticketEvents.emit('review', { ticketId: id, guildId: guild.id, rating: 5 });
    await settle();
    const lines = logChannel.sent.map((m) => m.content);
    assert.equal(lines.length, 3);
    assert.match(lines[0], /New order.*<@alice>/);
    assert.match(lines[1], /form → open/);
    assert.match(lines[2], /Review.*5\/5/);
    assert.ok(lines.every((l) => l.includes(id)), 'every line names the ticket');
  } finally {
    detach();
  }
});

test('no log channel configured — nothing is sent and nothing breaks', async () => {
  const guild = fakeGuild({ id: 'g-log-none' });
  const other = fakeChannel(guild);
  const detach = attachStaffLog(fakeClient([other]));
  try {
    createTicket({ type: 'help', guildId: guild.id, clientId: 'bob', clientChannelId: 'ch-none' });
    await settle();
    assert.equal(other.sent.length, 0);
  } finally {
    detach();
  }
});

test('mentions in the log do not ping anyone', async () => {
  const guild = fakeGuild({ id: 'g-log-quiet' });
  const logChannel = fakeChannel(guild);
  setSetting(guild.id, 'channel_log', logChannel.id);
  const detach = attachStaffLog(fakeClient([logChannel]));
  try {
    createTicket({ type: 'order', guildId: guild.id, clientId: 'carol', clientChannelId: 'ch-quiet' });
    await settle();
    assert.deepEqual(logChannel.sent[0].allowedMentions, { parse: [] });
  } finally {
    detach();
  }
});
