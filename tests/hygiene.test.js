import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeChannel, fakeClient } from './helpers/fakes.js';
import { sweepAbandonedForms } from '../src/jobs/cleanupJob.js';
import { getTicketById } from '../src/modules/tickets/TicketRepository.js';
import { run } from '../src/core/Database.js';

const HOUR = 3600_000;

function abandoned(guildId, hoursAgo) {
  const guild = fakeGuild({ id: guildId });
  const channel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId, clientId: 'alice', clientChannelId: channel.id, inForm: true });
  const created = new Date(Date.now() - hoursAgo * HOUR).toISOString().slice(0, 19).replace('T', ' ');
  run('UPDATE tickets SET created_at = ? WHERE id = ?', [created, ticketId]);
  return { channel, ticketId, discord: fakeClient([channel]) };
}

test('a form untouched for 48h gets one reminder', async () => {
  const s = abandoned('g-hyg-remind', 49);
  await sweepAbandonedForms(s.discord);
  await sweepAbandonedForms(s.discord);
  const reminders = s.channel.sent.filter((m) => /not submitted/.test(m.content ?? ''));
  assert.equal(reminders.length, 1, 'reminded once, not on every sweep');
  assert.match(reminders[0].content, /<@alice>/);
  assert.equal(getTicketById(s.ticketId).status, 'form');
});

test('24h after the reminder the ticket is closed automatically', async () => {
  const s = abandoned('g-hyg-close', 80);
  await sweepAbandonedForms(s.discord);
  run('UPDATE tickets SET stale_reminded_at = ? WHERE id = ?', [Date.now() - 25 * HOUR, s.ticketId]);
  await sweepAbandonedForms(s.discord);
  const t = getTicketById(s.ticketId);
  assert.equal(t.status, 'closed');
  assert.ok(t.channel_delete_at, 'goes through the normal close: deletion scheduled');
  assert.ok(s.channel.sent.some((m) => /Closed automatically/.test(m.content ?? '')));
});

test('young forms and finished orders are left alone', async () => {
  const young = abandoned('g-hyg-young', 2);
  await sweepAbandonedForms(young.discord);
  assert.equal(young.channel.sent.length, 0);

  const guild = fakeGuild({ id: 'g-hyg-open' });
  const channel = fakeChannel(guild);
  const id = seedOrder({ guildId: guild.id, clientId: 'bob', clientChannelId: channel.id });
  run("UPDATE tickets SET created_at = '2020-01-01 00:00:00' WHERE id = ?", [id]);
  await sweepAbandonedForms(fakeClient([channel]));
  assert.equal(channel.sent.length, 0, 'an open order is not a stale form');
});
