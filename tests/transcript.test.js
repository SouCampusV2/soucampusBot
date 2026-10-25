import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { setSetting, seedOrder } from './helpers/db.js';
import { fakeGuild, fakeChannel, fakeClient } from './helpers/fakes.js';
import { fetchAllMessages, formatTranscript, sendTranscript } from '../src/modules/tickets/Transcript.js';

/** Fake Discord message history: ids grow with time; fetch({ limit, before }) pages newest-first like the API. */
function history(count) {
  const messages = Array.from({ length: count }, (_, i) => ({
    id: String(1000 + i),
    createdAt: new Date(Date.UTC(2026, 9, 26, 10, 0, i)),
    author: { username: i % 2 ? 'bob' : 'alice', bot: false },
    member: null,
    content: `message ${i}`,
    attachments: new Collection(),
    embeds: [],
  }));
  const calls = [];
  return {
    calls,
    messages: {
      fetch: async ({ limit, before }) => {
        calls.push({ limit, before });
        const older = messages.filter((m) => !before || Number(m.id) < Number(before)).reverse().slice(0, limit);
        return new Collection(older.map((m) => [m.id, m]));
      },
    },
  };
}

test('fetches the whole history in pages of 100, returned oldest first', async () => {
  const channel = history(250);
  const all = await fetchAllMessages(channel);
  assert.equal(all.length, 250);
  assert.equal(all[0].content, 'message 0');
  assert.equal(all.at(-1).content, 'message 249');
  assert.equal(channel.calls.length, 3);
});

test('stops at the cap so a huge channel cannot exhaust memory', async () => {
  const all = await fetchAllMessages(history(350), 200);
  assert.equal(all.length, 200);
  assert.equal(all.at(-1).content, 'message 349', 'keeps the most recent part');
});

test('the transcript has time, author, text, attachments and bot embeds', () => {
  const text = formatTranscript({ id: 't1', type: 'order' }, [
    {
      createdAt: new Date('2026-10-26T10:00:00Z'),
      author: { username: 'alice', bot: false },
      member: { displayName: 'Alice' },
      content: 'Can it be bigger?',
      attachments: new Collection([['a', { name: 'ref.png', url: 'https://cdn/ref.png' }]]),
      embeds: [],
    },
    {
      createdAt: new Date('2026-10-26T10:01:00Z'),
      author: { username: 'BoCampus', bot: true },
      member: null,
      content: '',
      attachments: new Collection(),
      embeds: [{ title: 'Quote', description: null, fields: [{ name: 'Price', value: '€300' }] }],
    },
  ]);
  assert.match(text, /Ticket t1 \(order\)/);
  assert.match(text, /\[2026-10-26 10:00\] Alice: Can it be bigger\?/);
  assert.match(text, /attachment: ref\.png https:\/\/cdn\/ref\.png/);
  assert.match(text, /\[2026-10-26 10:01\] BoCampus \[bot\]: \[embed\] Quote — Price: €300/);
});

test('on close the transcript goes to the staff log channel and to the client', async () => {
  const guild = fakeGuild({ id: 'g-transcript' });
  const logChannel = fakeChannel(guild);
  setSetting(guild.id, 'channel_log', logChannel.id);
  const clientChannel = Object.assign(fakeChannel(guild), history(3));
  const ticketId = seedOrder({ guildId: guild.id, clientId: 'alice', clientChannelId: clientChannel.id });
  const discord = fakeClient([logChannel, clientChannel]);
  const dmFiles = [];
  discord.users.fetch = async () => ({ send: async (p) => dmFiles.push(p) });

  await sendTranscript(discord, ticketId);
  assert.equal(logChannel.sent.length, 1);
  assert.equal(logChannel.sent[0].files[0].name, `transcript-${ticketId}.txt`);
  assert.equal(dmFiles.length, 1, 'the client gets a copy');
});
