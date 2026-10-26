import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, finalText } from './helpers/fakes.js';
import { parseReactionList, reactToShowcasePost } from '../src/modules/site/showcaseReactions.js';
import { handleSetupCommand } from '../src/commands/setupCommand.js';
import { getSetting } from '../src/core/GuildConfig.js';

test('reaction list: unicode emoji and server emoji, separated by spaces or commas', () => {
  assert.deepEqual(parseReactionList('🔥 👀, 💙'), ['🔥', '👀', '💙']);
  assert.deepEqual(parseReactionList('<:liberty:123456789012345678> 🔥'), ['<:liberty:123456789012345678>', '🔥']);
  assert.deepEqual(parseReactionList('<a:spin:123456789012345678>'), ['<a:spin:123456789012345678>']);
  assert.equal(parseReactionList('hello'), null, 'plain words are not emoji');
  assert.equal(parseReactionList(Array(11).fill('🔥').join(' ')), null, 'at most 10');
  assert.deepEqual(parseReactionList(''), []);
});

function showcaseMessage(guildId, channelId, webhookId) {
  const reacted = [];
  return {
    reacted,
    message: {
      guildId,
      channelId,
      webhookId,
      react: async (emoji) => reacted.push(emoji),
    },
  };
}

test('the bot reacts only to posts of its showcase webhook in the showcase channel', async () => {
  const guildId = 'g-react';
  setSetting(guildId, 'channel_showcase', 'show-ch');
  setSetting(guildId, 'showcase_webhook_id', 'hook-1');
  setSetting(guildId, 'showcase_reactions', '🔥 👀 <:liberty:123456789012345678>');

  const post = showcaseMessage(guildId, 'show-ch', 'hook-1');
  await reactToShowcasePost(post.message);
  assert.deepEqual(post.reacted, ['🔥', '👀', '<:liberty:123456789012345678>'], 'in the configured order');

  const otherWebhook = showcaseMessage(guildId, 'show-ch', 'someone-elses-hook');
  await reactToShowcasePost(otherWebhook.message);
  const person = showcaseMessage(guildId, 'show-ch', null);
  await reactToShowcasePost(person.message);
  const otherChannel = showcaseMessage(guildId, 'chat', 'hook-1');
  await reactToShowcasePost(otherChannel.message);
  assert.equal(otherWebhook.reacted.length + person.reacted.length + otherChannel.reacted.length, 0);
});

test('one emoji that fails (deleted server emoji) does not stop the others', async () => {
  setSetting('g-react-fail', 'channel_showcase', 'c');
  setSetting('g-react-fail', 'showcase_webhook_id', 'h');
  setSetting('g-react-fail', 'showcase_reactions', '<:gone:123456789012345678> 🔥');
  const reacted = [];
  await reactToShowcasePost({
    guildId: 'g-react-fail',
    channelId: 'c',
    webhookId: 'h',
    react: async (e) => {
      if (e.startsWith('<:gone')) throw new Error('Unknown Emoji');
      reacted.push(e);
    },
  });
  assert.deepEqual(reacted, ['🔥']);
});

test('/setup showcase_channel remembers its webhook id; /setup showcase_reactions validates', async () => {
  const guild = fakeGuild({ id: 'g-react-setup' });
  const channel = fakeChannel(guild);
  channel.fetchWebhooks = async () => new Collection();
  channel.createWebhook = async ({ name }) => ({ id: 'hook-new', name, owner: { id: 'bot-user' }, url: 'https://discord.com/api/webhooks/hook-new/t' });
  const run = async (sub, opts) => {
    const i = fakeInteraction({ client: fakeClient([channel]), member: fakeMember(guild, { admin: true }), guild });
    i.isChatInputCommand = () => true;
    i.commandName = 'setup';
    i.options = { getSubcommand: () => sub, getChannel: () => channel, getBoolean: () => false, getString: (k) => opts[k] ?? null };
    await handleSetupCommand(i);
    return i;
  };
  await run('showcase_channel', {});
  assert.equal(getSetting(guild.id, 'showcase_webhook_id'), 'hook-new');

  assert.match(finalText(await run('showcase_reactions', { emojis: 'nope' })), /emoji/i);
  assert.match(finalText(await run('showcase_reactions', { emojis: '🔥 💙' })), /✅/);
  assert.equal(getSetting(guild.id, 'showcase_reactions'), '🔥 💙');
});

test('premade and free posts get reactions too; announcements do not', async () => {
  const guildId = 'g-react-kinds';
  setSetting(guildId, 'channel_premade', 'pre-ch');
  setSetting(guildId, 'premade_webhook_id', 'pre-hook');
  setSetting(guildId, 'channel_announcements', 'ann-ch');
  setSetting(guildId, 'announce_webhook_id', 'ann-hook');
  setSetting(guildId, 'showcase_reactions', '🔥');

  const premade = showcaseMessage(guildId, 'pre-ch', 'pre-hook');
  await reactToShowcasePost(premade.message);
  assert.deepEqual(premade.reacted, ['🔥']);

  const announcement = showcaseMessage(guildId, 'ann-ch', 'ann-hook');
  await reactToShowcasePost(announcement.message);
  assert.deepEqual(announcement.reacted, []);

  const wrongChannel = showcaseMessage(guildId, 'ann-ch', 'pre-hook');
  await reactToShowcasePost(wrongChannel.message);
  assert.deepEqual(wrongChannel.reacted, [], 'a webhook counts only in its own channel');
});
