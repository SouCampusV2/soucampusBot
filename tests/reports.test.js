import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeClient, fakeInteraction, answerText } from './helpers/fakes.js';
import { listOpenTickets, computeStats, parsePrice } from '../src/modules/tickets/Reports.js';
import { handleOrdersCommand } from '../src/commands/ordersCommand.js';
import { handleStatsCommand } from '../src/commands/statsCommand.js';
import { createTicket, updateTicketDeadline } from '../src/modules/tickets/TicketRepository.js';
import { createReview } from '../src/modules/reviews/ReviewRepository.js';
import { STATUS, transitionTicket } from '../src/modules/tickets/TicketStatus.js';
import { run } from '../src/core/Database.js';

test('prices are read from what freelancers type', () => {
  assert.equal(parsePrice('€300'), 300);
  assert.equal(parsePrice('250 eur'), 250);
  assert.equal(parsePrice('1,200€'), 1200);
  assert.equal(parsePrice('€99.50'), 99.5);
  assert.equal(parsePrice('negotiable'), null);
});

test('/orders data: open tickets of this server, overdue first, closed ones left out', () => {
  const g = 'g-rep-list';
  const late = seedOrder({ guildId: g, clientId: 'a', clientChannelId: 'c-late', assignedFreelancerId: 'f' });
  updateTicketDeadline(late, '2020-01-01');
  const fresh = seedOrder({ guildId: g, clientId: 'b', clientChannelId: 'c-fresh' });
  const gone = seedOrder({ guildId: g, clientId: 'c', clientChannelId: 'c-gone' });
  transitionTicket(gone, STATUS.CLOSED);
  seedOrder({ guildId: 'other-guild', clientId: 'd', clientChannelId: 'c-other' });

  const rows = listOpenTickets(g, '2026-10-26');
  assert.deepEqual(rows.map((r) => r.id), [late, fresh]);
  assert.equal(rows[0].overdue, true);
  assert.equal(rows[1].overdue, false);
});

test('/stats data: funnel, money and reputation over a window', () => {
  const g = 'g-rep-stats';
  // 3 orders: one only opened, one paid, one delivered and reviewed.
  seedOrder({ guildId: g, clientId: 'a', clientChannelId: 's1' });
  const paid = seedOrder({ guildId: g, clientId: 'b', clientChannelId: 's2', assignedFreelancerId: 'f', paid: true });
  const done = seedOrder({ guildId: g, clientId: 'c', clientChannelId: 's3', assignedFreelancerId: 'f', completed: true });
  for (const id of [paid, done]) {
    run("INSERT INTO action_log (ticket_id, actor_id, action, detail) VALUES (?, 'm', 'confirm_payment', '')", [id]);
  }
  createReview({ ticketId: done, clientId: 'c', freelancerId: 'f', rating: 4, comment: '' });
  createTicket({ type: 'help', guildId: g, clientId: 'h', clientChannelId: 's4' });

  const stats = computeStats(g, Date.now() - 30 * 86_400_000);
  assert.equal(stats.orders, 3);
  assert.equal(stats.paid, 2);
  assert.equal(stats.delivered, 1);
  assert.equal(stats.conversion, 67, '2 of 3 orders reached payment');
  assert.equal(stats.avgPrice, 200, 'seeded proposals are €200');
  assert.equal(stats.avgRating, 4);
  assert.equal(stats.help, 1);
});

test('both commands are manager-only', async () => {
  const guild = fakeGuild({ id: 'g-rep-door' });
  const member = fakeMember(guild);
  for (const handler of [handleOrdersCommand, handleStatsCommand]) {
    const i = fakeInteraction({ client: fakeClient(), member, guild });
    i.isChatInputCommand = () => true;
    i.options = { getString: () => null, getInteger: () => null };
    await handler(i);
    assert.match(answerText(i), /manager/i);
  }
});

test('/orders for a manager lists the tickets', async () => {
  const staff = fakeRole('Staff');
  const guild = fakeGuild({ id: 'g-rep-cmd', roles: [staff] });
  setSetting(guild.id, 'role_manager', staff.id);
  seedOrder({ guildId: guild.id, clientId: 'z', clientChannelId: 'chan-z' });
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild, { roles: [staff] }), guild });
  i.isChatInputCommand = () => true;
  i.options = { getString: () => null, getInteger: () => null };
  await handleOrdersCommand(i);
  assert.match(JSON.stringify(i.calls[0].payload.embeds[0].data), /<#chan-z>/);
});
