import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeRole, fakeInteraction, answerText } from './helpers/fakes.js';
import { parseAmount, tierFor, updateClientTiers, addTicketMember, clientStats } from '../src/modules/clients/ClientTiers.js';
import { handlePaylinkCommand } from '../src/commands/takeCommand.js';
import { run } from '../src/core/Database.js';

test('parseAmount reads the first number of a price', () => {
  assert.equal(parseAmount('$480'), 480);
  assert.equal(parseAmount('€1,200.50'), 1200.5);
  assert.equal(parseAmount('450-550 USD'), 450);
  assert.equal(parseAmount('free'), 0);
  assert.equal(parseAmount(null), 0);
});

test('tiers: orders AND total must both be reached', () => {
  assert.equal(tierFor({ orders: 0, total: 0 }), null);
  assert.equal(tierFor({ orders: 1, total: 10 }).key, 'client');
  assert.equal(tierFor({ orders: 5, total: 499 }).key, 'client');
  assert.equal(tierFor({ orders: 5, total: 500 }).key, 'notable');
  assert.equal(tierFor({ orders: 9, total: 5000 }).key, 'notable');
  assert.equal(tierFor({ orders: 10, total: 1000 }).key, 'vip');
});

function setup(guildId) {
  const roles = { client: fakeRole('Client'), notable: fakeRole('Notable'), vip: fakeRole('VIP') };
  const guild = fakeGuild({ id: guildId, roles: Object.values(roles) });
  for (const [k, r] of Object.entries(roles)) setSetting(guild.id, `role_${k}`, r.id);
  const author = fakeMember(guild, { name: 'Fred' });
  const payer = fakeMember(guild, { name: 'Galactic' });
  const builder = fakeMember(guild, { name: 'Builder' });
  const clientChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: author.id, clientChannelId: clientChannel.id, assignedFreelancerId: builder.id, paid: true });
  return { guild, roles, author, payer, builder, clientChannel, ticketId, discord: fakeClient([clientChannel]) };
}

test('paid order: author and invited payer get the Client role, the builder does not', async () => {
  const s = setup('g-tier-first');
  addTicketMember(s.ticketId, s.payer.id, 'manager');
  await updateClientTiers(s.discord, s.ticketId);
  assert.ok(s.author.roles.cache.has(s.roles.client.id));
  assert.ok(s.payer.roles.cache.has(s.roles.client.id));
  assert.ok(!s.builder.roles.cache.has(s.roles.client.id));
  assert.equal(clientStats(s.guild.id, s.author.id).total, 200, 'seeded quote is €200');

  await updateClientTiers(s.discord, s.ticketId); // same order again (event fired twice)
  assert.equal(clientStats(s.guild.id, s.author.id).orders, 1, 'an order counts once');
});

test('reaching Notable swaps the Client role for the Notable one', async () => {
  const s = setup('g-tier-up');
  s.author.roles.cache.set(s.roles.client.id, s.roles.client);
  for (let n = 0; n < 4; n += 1) {
    run('INSERT INTO client_payments (guild_id, user_id, ticket_id, amount) VALUES (?, ?, ?, ?)', [s.guild.id, s.author.id, `old-${n}`, 100]);
  }
  await updateClientTiers(s.discord, s.ticketId); // 5th order, 400 + 200 = 600
  assert.ok(s.author.roles.cache.has(s.roles.notable.id));
  assert.ok(!s.author.roles.cache.has(s.roles.client.id));
  assert.ok(s.clientChannel.sent.some((m) => m.content?.includes('Notable client')));
});

test('/paylink: only managers; posts a Pay link button in the client channel', async () => {
  const s = setup('g-paylink');
  const manager = fakeMember(s.guild, { admin: true });
  const run1 = (member, opts) => {
    const i = fakeInteraction({ client: s.discord, member, guild: s.guild, channel: s.clientChannel });
    i.channelId = s.clientChannel.id;
    i.options = { getString: (n) => opts[n] ?? null };
    return i;
  };
  const opts = { link: 'https://www.paypal.com/invoice/p/#ABC', amount: '$240' };

  const stranger = run1(s.payer, opts);
  await handlePaylinkCommand(stranger);
  assert.match(answerText(stranger), /only managers/i);
  assert.equal(s.clientChannel.sent.length, 0);

  const bad = run1(manager, { ...opts, link: 'javascript:alert(1)' });
  await handlePaylinkCommand(bad);
  assert.match(answerText(bad), /https/);

  const ok = run1(manager, opts);
  await handlePaylinkCommand(ok);
  const msg = s.clientChannel.sent.at(-1);
  const button = msg.components[0].toJSON().components[0];
  assert.equal(button.url, opts.link);
  assert.match(button.label, /\$240/);
});
