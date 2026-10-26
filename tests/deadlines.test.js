import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeChannel, fakeClient, fakeInteraction, answerText } from './helpers/fakes.js';
import { handleExtendDeadlineModal } from '../src/interactions/handlers/extendDeadlineModal.js';
import { sendDeadlineReminders } from '../src/jobs/deadlineJob.js';
import { getTicketById, updateTicketDeadline } from '../src/modules/tickets/TicketRepository.js';
import { normalizeDeadlines } from '../src/core/Database.js';
import { todayIso } from '../src/utils/dates.js';

function setup(guildId, opts = {}) {
  const staff = fakeRole('Staff');
  const guild = fakeGuild({ id: guildId, roles: [staff] });
  setSetting(guild.id, 'role_manager', staff.id);
  const manager = fakeMember(guild, { roles: [staff] });
  const client = fakeMember(guild);
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({
    guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, freelancerChannelId: quoteChannel.id, ...opts,
  });
  return { guild, manager, client, clientChannel, quoteChannel, ticketId, discord: fakeClient([clientChannel, quoteChannel]) };
}

const extend = (s, member, text) => {
  const i = fakeInteraction({ client: s.discord, member, guild: s.guild, fields: { new_deadline: text } });
  return handleExtendDeadlineModal(i, ['extend_deadline_modal', s.ticketId]).then(() => i);
};

test('the Extend Deadline modal re-checks that a manager submits it', async () => {
  const s = setup('g-dl-door');
  await extend(s, s.client, '2099-01-01');
  assert.equal(getTicketById(s.ticketId).deadline, null);
});

test('a manager sets a new deadline in any supported format; it is stored as a date', async () => {
  const s = setup('g-dl-ok');
  const i = await extend(s, s.manager, '25.12.2099');
  assert.match(answerText(i), /2099-12-25/);
  assert.equal(getTicketById(s.ticketId).deadline, '2099-12-25');
  assert.ok(s.clientChannel.sent.some((m) => /Deadline updated/.test(m.content ?? '')));
  assert.equal(s.quoteChannel.sent.length, 1);
  const card = s.clientChannel.sent.find((m) => m.embeds?.[0]?.data?.title?.startsWith('Order ·'));
  assert.match(JSON.stringify(card.embeds[0].data), /2099-12-25/, 'the order card shows the new deadline');
});

test('unreadable or past dates are refused for managers', async () => {
  const s = setup('g-dl-bad');
  assert.match(answerText(await extend(s, s.manager, 'soon-ish')), /could not read/i);
  assert.match(answerText(await extend(s, s.manager, '2001-01-01')), /past/i);
  assert.equal(getTicketById(s.ticketId).deadline, null);
});

test('reminders go to orders due today or tomorrow — not later, not closed', async () => {
  const now = new Date();
  const due = setup('g-dl-remind-due', { assignedFreelancerId: 'f' });
  updateTicketDeadline(due.ticketId, todayIso(new Date(now.getTime() + 86_400_000)));
  const later = setup('g-dl-remind-later');
  updateTicketDeadline(later.ticketId, 'in 10 days');
  const discord = fakeClient([due.clientChannel, due.quoteChannel, later.clientChannel, later.quoteChannel]);

  await sendDeadlineReminders(discord, now);
  assert.match(due.clientChannel.sent.at(-1).content, /tomorrow/);
  assert.equal(due.quoteChannel.sent.length, 1, 'quote channel gets the reminder with Extend Deadline');
  assert.equal(later.clientChannel.sent.length, 0);
});

test('old free-text deadlines are converted once, relative ones from the creation day', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tickets (id TEXT PRIMARY KEY, deadline TEXT, created_at TEXT);
    INSERT INTO tickets VALUES ('iso', '2026-12-25', '2026-10-01 10:00:00'),
      ('eu', '25.12.2026', '2026-10-01 10:00:00'),
      ('rel', '2 weeks', '2026-10-01 10:00:00'),
      ('junk', 'asap', '2026-10-01 10:00:00');
  `);
  normalizeDeadlines(db);
  const got = Object.fromEntries(db.prepare('SELECT id, deadline FROM tickets').all().map((r) => [r.id, r.deadline]));
  assert.deepEqual(got, { iso: '2026-12-25', eu: '2026-12-25', rel: '2026-10-15', junk: null });
});
