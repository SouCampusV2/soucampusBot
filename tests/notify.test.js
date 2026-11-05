import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeClient, fakeInteraction } from './helpers/fakes.js';
import { handleCreateTicket } from '../src/interactions/handlers/createTicket.js';
import { parseNotifyTarget } from '../src/utils/notify.js';

async function openHelp(guild) {
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild), guild });
  await handleCreateTicket(i, ['create_ticket', 'help']);
  return guild.createdChannels.at(-1);
}

const pings = (channel) => channel.sent.filter((m) => typeof m.content === 'string' && m.content.startsWith('🔔'));

test('the configured person is pinged in a new ticket, and only them', async () => {
  const guild = fakeGuild({ id: 'g-notify-user' });
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  setSetting(guild.id, 'notify_target', 'user:123456789012345678');
  const channel = await openHelp(guild);
  const [ping] = pings(channel);
  assert.ok(ping, 'a ping was sent');
  assert.match(ping.content, /<@123456789012345678>/);
  assert.deepEqual(ping.allowedMentions, { users: ['123456789012345678'] });
});

test('nothing configured — no ping', async () => {
  const guild = fakeGuild({ id: 'g-notify-none' });
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  const channel = await openHelp(guild);
  assert.equal(pings(channel).length, 0);
});

test('stored values parse into a mention; garbage is ignored', () => {
  assert.equal(parseNotifyTarget('role:987654321098765432').mention, '<@&987654321098765432>');
  assert.equal(parseNotifyTarget('user:x'), null);
  assert.equal(parseNotifyTarget(null), null);
});
