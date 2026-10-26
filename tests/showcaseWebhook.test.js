import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, finalText } from './helpers/fakes.js';
import { handleSetupCommand } from '../src/commands/setupCommand.js';
import { getSetting } from '../src/core/GuildConfig.js';

const BOT = 'bot-user';

/** A text channel that can hold webhooks, like discord.js's TextChannel. */
function channelWithWebhooks(guild) {
  const channel = fakeChannel(guild);
  const hooks = new Collection();
  let n = 0;
  channel.hooks = hooks;
  channel.fetchWebhooks = async () => hooks;
  channel.createWebhook = async ({ name }) => {
    const id = `wh${++n}`;
    const hook = {
      id,
      name,
      owner: { id: BOT },
      url: `https://discord.com/api/webhooks/${id}/token${n}`,
      delete: async () => hooks.delete(id),
    };
    hooks.set(id, hook);
    return hook;
  };
  return channel;
}

async function runSetup(guild, channel, { newLink = false } = {}) {
  const i = fakeInteraction({ client: fakeClient([channel]), member: fakeMember(guild, { admin: true }), guild });
  i.isChatInputCommand = () => true;
  i.commandName = 'setup';
  i.options = {
    getSubcommand: () => 'showcase_channel',
    getChannel: () => channel,
    getBoolean: () => newLink,
  };
  await handleSetupCommand(i);
  return i;
}

test('creates one showcase webhook and shows its link only to the admin', async () => {
  const guild = fakeGuild({ id: 'g-hook-create' });
  const channel = channelWithWebhooks(guild);
  const i = await runSetup(guild, channel);
  assert.equal(channel.hooks.size, 1);
  assert.match(finalText(i), /https:\/\/discord\.com\/api\/webhooks\/wh1\/token1/);
  assert.match(finalText(i), /DISCORD_SHOWCASE_WEBHOOK_URL/, 'says where the link goes');
  assert.ok(i.calls.some((c) => c.kind === 'deferReply' && c.payload?.flags), 'ephemeral');
  assert.equal(getSetting(guild.id, 'channel_showcase'), channel.id);
});

test('running it again reuses the same webhook (the site keeps working)', async () => {
  const guild = fakeGuild({ id: 'g-hook-reuse' });
  const channel = channelWithWebhooks(guild);
  await runSetup(guild, channel);
  const again = await runSetup(guild, channel);
  assert.equal(channel.hooks.size, 1);
  assert.match(finalText(again), /wh1\/token1/);
});

test('new_link: the old link stops working, a new one is issued', async () => {
  const guild = fakeGuild({ id: 'g-hook-rotate' });
  const channel = channelWithWebhooks(guild);
  await runSetup(guild, channel);
  const rotated = await runSetup(guild, channel, { newLink: true });
  assert.deepEqual([...channel.hooks.keys()], ['wh2']);
  assert.match(finalText(rotated), /wh2\/token2/);
});

test('webhooks made by someone else in that channel are left alone', async () => {
  const guild = fakeGuild({ id: 'g-hook-foreign' });
  const channel = channelWithWebhooks(guild);
  channel.hooks.set('other', { id: 'other', name: 'SouCampus Showcase', owner: { id: 'someone' }, url: 'x', delete: async () => {} });
  await runSetup(guild, channel, { newLink: true });
  assert.ok(channel.hooks.has('other'));
});
