import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeClient, fakeInteraction, finalText } from './helpers/fakes.js';
import { handleCreateTicket } from '../src/interactions/handlers/createTicket.js';
import { handleSetupCommand } from '../src/commands/setupCommand.js';

async function open(guild, type) {
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild), guild });
  await handleCreateTicket(i, ['create_ticket', type]);
  return guild.createdChannels.at(-1);
}

test('each ticket type goes to its own category', async () => {
  const guild = fakeGuild({ id: 'g-cat-each' });
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  setSetting(guild.id, 'category_help', 'help-cat');
  setSetting(guild.id, 'category_applications', 'apply-cat');
  assert.equal((await open(guild, 'order')).parentId, 'orders-cat');
  assert.equal((await open(guild, 'help')).parentId, 'help-cat');
  assert.equal((await open(guild, 'application')).parentId, 'apply-cat');
});

test('without its own category a type falls back to the orders category', async () => {
  const guild = fakeGuild({ id: 'g-cat-fallback' });
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  assert.equal((await open(guild, 'help')).parentId, 'orders-cat');
});

test('/setup help_category and applications_category save the category', async () => {
  const guild = fakeGuild({ id: 'g-cat-setup' });
  for (const [sub, id] of [['help_category', 'h1'], ['applications_category', 'a1']]) {
    const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild, { admin: true }), guild });
    i.isChatInputCommand = () => true;
    i.commandName = 'setup';
    i.options = { getSubcommand: () => sub, getChannel: () => ({ id, name: sub }) };
    await handleSetupCommand(i);
    assert.match(finalText(i), /✅/);
  }
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  assert.equal((await open(guild, 'help')).parentId, 'h1');
  assert.equal((await open(guild, 'application')).parentId, 'a1');
});
