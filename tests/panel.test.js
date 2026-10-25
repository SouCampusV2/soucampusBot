import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import './helpers/db.js';
import { fakeGuild, fakeChannel } from './helpers/fakes.js';
import { ensurePanel } from '../src/utils/panel.js';
import { PREFIX } from '../src/constants.js';

const BOT_ID = 'bot-user';

function panelMessage(authorId) {
  return { author: { id: authorId }, components: [{ components: [{ customId: PREFIX.CREATE_TICKET }] }] };
}

function channelWithHistory(messages) {
  const channel = fakeChannel(fakeGuild({ id: 'g-panel' }));
  channel.messages = { fetch: async () => new Collection(messages.map((m, i) => [String(i), m])) };
  return channel;
}

test('restarting the bot does not post a second panel', async () => {
  const channel = channelWithHistory([panelMessage(BOT_ID)]);
  const posted = await ensurePanel(channel, BOT_ID);
  assert.equal(posted, false);
  assert.equal(channel.sent.length, 0);
});

test('a panel is posted when the channel has none', async () => {
  const channel = channelWithHistory([{ author: { id: 'someone' }, components: [] }]);
  assert.equal(await ensurePanel(channel, BOT_ID), true);
  assert.equal(channel.sent.length, 1);
});

test("someone else's message with the same button does not count as our panel", async () => {
  const channel = channelWithHistory([panelMessage('other-bot')]);
  assert.equal(await ensurePanel(channel, BOT_ID), true);
});
