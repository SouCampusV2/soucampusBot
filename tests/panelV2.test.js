import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, MessageFlags } from 'discord.js';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind, finalText } from './helpers/fakes.js';
import { getTicketPanelPayload } from '../src/embeds/templates.js';
import { ensurePanel } from '../src/utils/panel.js';
import { handleCreateTicket } from '../src/interactions/handlers/createTicket.js';
import { handleSetupCommand } from '../src/commands/setupCommand.js';
import { getTicketByClientChannelId } from '../src/modules/tickets/TicketRepository.js';

/** All custom ids / urls anywhere in a V2 component tree. */
function walk(node, out = { ids: [], urls: [], types: [] }) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === 'object') {
    if (node.type) out.types.push(node.type);
    if (node.custom_id) out.ids.push(node.custom_id);
    if (node.url) out.urls.push(node.url);
    Object.values(node).forEach((v) => typeof v === 'object' && walk(v, out));
  }
  return out;
}

const json = (payload) => payload.components.map((c) => c.toJSON());

test('the panel is a Components V2 card: one button per ticket type, plus legal links', () => {
  const payload = getTicketPanelPayload('g-panel-v2', { guildName: 'SouCampus' });
  assert.equal(payload.flags, MessageFlags.IsComponentsV2);
  const tree = walk(json(payload));
  assert.deepEqual(tree.ids.sort(), ['create_ticket:application', 'create_ticket:help', 'create_ticket:order']);
  assert.ok(tree.urls.includes('https://soucampus.online/terms'));
  assert.ok(tree.urls.includes('https://soucampus.online/privacy'));
  assert.match(JSON.stringify(json(payload)), /€1\.5/, 'the price guide is on the panel');
});

test('/setup links: terms, privacy and banner show up on the panel; http is refused', async () => {
  const guild = fakeGuild({ id: 'g-panel-links' });
  const run = async (opts) => {
    const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild, { admin: true }), guild });
    i.isChatInputCommand = () => true;
    i.commandName = 'setup';
    i.options = { getSubcommand: () => 'links', getString: (k) => opts[k] ?? null };
    await handleSetupCommand(i);
    return i;
  };
  assert.match(finalText(await run({ terms: 'http://insecure.example' })), /https/);
  await run({ terms: 'https://soucampus.online/terms/discord', banner: 'https://cdn.example/banner.png' });
  const tree = walk(json(getTicketPanelPayload(guild.id, { guildName: 'X' })));
  assert.ok(tree.urls.includes('https://soucampus.online/terms/discord'));
  assert.ok(tree.urls.includes('https://cdn.example/banner.png'), 'banner as a media gallery');
});

test('/setup panel answers first (3-second rule) and replaces the old panel in place', async () => {
  const guild = fakeGuild({ id: 'g-panel-replace' });
  const channel = fakeChannel(guild);
  const old = await channel.send({ components: [{ components: [{ customId: 'create_ticket' }] }] });
  old.author = { id: 'bot-user' };
  channel.messages.fetch = async (arg) =>
    typeof arg === 'string' ? channel.posted.get(arg) : new Collection([...channel.posted].reverse());
  const sentBefore = channel.sent.length;

  const i = fakeInteraction({ client: fakeClient([channel]), member: fakeMember(guild, { admin: true }), guild, channel });
  i.isChatInputCommand = () => true;
  i.commandName = 'setup';
  i.options = { getSubcommand: () => 'panel', getChannel: () => channel };
  await handleSetupCommand(i);

  assert.equal(answerKind(i), 'deferReply');
  assert.equal(channel.sent.length, sentBefore, 'no second panel');
  assert.equal(old.flags, MessageFlags.IsComponentsV2, 'the old panel was edited into the new one');
  assert.match(finalText(i), /updated/i);
});

test('a panel button opens that ticket type straight away (no menu, no confirm)', async () => {
  const guild = fakeGuild({ id: 'g-panel-direct' });
  setSetting(guild.id, 'category_active_orders', 'cat');
  const member = fakeMember(guild, { name: 'Steve' });
  const i = fakeInteraction({ client: fakeClient(), member, guild });
  await handleCreateTicket(i, ['create_ticket', 'order']);
  assert.equal(answerKind(i), 'deferReply', 'a fresh ephemeral answer — the panel itself is not edited');
  assert.match(finalText(i), /Ticket created/);
  const [channel] = guild.createdChannels;
  assert.equal(getTicketByClientChannelId(channel.id).type, 'order');
});

test('old panels (button without a type) still show the type menu', async () => {
  const guild = fakeGuild({ id: 'g-panel-legacy' });
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild), guild });
  await handleCreateTicket(i, ['create_ticket']);
  assert.equal(answerKind(i), 'reply');
  assert.match(finalText(i), /Choose the type/);
});

test('ensurePanel finds a V2 panel (button nested in a container section)', async () => {
  const guild = fakeGuild({ id: 'g-panel-find' });
  const channel = fakeChannel(guild);
  const v2 = {
    author: { id: 'bot-user' },
    components: [{ components: [{ components: [], accessory: { customId: 'create_ticket:order' } }] }],
  };
  channel.messages.fetch = async () => new Collection([['1', v2]]);
  assert.equal(await ensurePanel(channel, 'bot-user'), false);
  assert.equal(channel.sent.length, 0);
});
