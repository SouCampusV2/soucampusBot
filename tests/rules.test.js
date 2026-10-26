import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, MessageFlags } from 'discord.js';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, finalText } from './helpers/fakes.js';
import { handleSetupCommand } from '../src/commands/setupCommand.js';
import { handleRulesCommand } from '../src/commands/rulesCommand.js';
import { getRulesPayload } from '../src/embeds/templates.js';
import { getSetting } from '../src/core/GuildConfig.js';

const BOT = 'bot-user';
const json = (payload) => JSON.stringify(payload.components.map((c) => c.toJSON()));

async function runSetup(guild, channel, sub, opts = {}) {
  const i = fakeInteraction({ client: fakeClient([channel]), member: fakeMember(guild, { admin: true }), guild, channel });
  i.isChatInputCommand = () => true;
  i.commandName = 'setup';
  i.options = {
    getSubcommand: () => sub,
    getChannel: () => opts.channel ?? null,
    getString: (k) => opts[k] ?? null,
    getBoolean: (k) => opts[k] ?? null,
  };
  await handleSetupCommand(i);
  return i;
}

test('the rules card is Components V2 in the brand color, with payment terms and legal links', () => {
  setSetting('g-rules-card', 'brand_color', '#F97316');
  const payload = getRulesPayload('g-rules-card');
  assert.equal(payload.flags, MessageFlags.IsComponentsV2);
  const card = payload.components[0].toJSON();
  assert.equal(card.accent_color, 0xf97316);
  assert.match(json(payload), /PayPal/);
  assert.match(json(payload), /soucampus\.online\/terms/);
});

test('/setup rules posts once, then edits the same message in place', async () => {
  const guild = fakeGuild({ id: 'g-rules-upsert' });
  const channel = fakeChannel(guild);
  const first = await runSetup(guild, channel, 'rules');
  assert.ok(first.calls[0].kind === 'deferReply', 'answers first (3-second rule)');
  assert.match(finalText(first), /posted/);
  assert.equal(channel.sent.length, 1);
  const messageId = getSetting(guild.id, 'rules_message_id');

  const second = await runSetup(guild, channel, 'rules', { image: 'https://cdn.example/rules.png' });
  assert.match(finalText(second), /updated/);
  assert.equal(channel.sent.length, 1, 'no second copy');
  const edited = channel.posted.get(messageId);
  assert.match(JSON.stringify(edited.components.map((c) => c.toJSON())), /cdn\.example\/rules\.png/);
});

test('/setup rules refuses a non-https picture and posts nothing', async () => {
  const guild = fakeGuild({ id: 'g-rules-http' });
  const channel = fakeChannel(guild);
  const i = await runSetup(guild, channel, 'rules', { image: 'http://insecure.example/x.png' });
  assert.match(finalText(i), /https/);
  assert.equal(channel.sent.length, 0);
});

test('/rules shows the card only to the person who asked', async () => {
  const guild = fakeGuild({ id: 'g-rules-public' });
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild), guild });
  i.guildId = guild.id;
  await handleRulesCommand(i);
  const flags = i.calls[0].payload.flags;
  assert.ok(flags & MessageFlags.Ephemeral, 'ephemeral');
  assert.ok(flags & MessageFlags.IsComponentsV2, 'still a V2 card');
});

test('/setup announcements_channel gives its own webhook link and leaves the showcase one alone', async () => {
  const guild = fakeGuild({ id: 'g-announce' });
  const channel = fakeChannel(guild);
  const hooks = new Collection([['show', { id: 'show', name: 'SouCampus Showcase', owner: { id: BOT }, url: 'x', delete: async () => hooks.delete('show') }]]);
  channel.fetchWebhooks = async () => hooks;
  channel.createWebhook = async ({ name }) => {
    const hook = { id: 'ann', name, owner: { id: BOT }, url: 'https://discord.com/api/webhooks/ann/tok', delete: async () => hooks.delete('ann') };
    hooks.set('ann', hook);
    return hook;
  };
  const i = await runSetup(guild, channel, 'announcements_channel', { channel, new_link: true });
  assert.match(finalText(i), /DISCORD_ANNOUNCE_WEBHOOK_URL/);
  assert.match(finalText(i), /webhooks\/ann\/tok/);
  assert.ok(hooks.has('show'), 'rotating the announcements link does not kill the showcase link');
  assert.equal(getSetting(guild.id, 'channel_announcements'), channel.id);
});
