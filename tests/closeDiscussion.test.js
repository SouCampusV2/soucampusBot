import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind } from './helpers/fakes.js';
import { handleCloseDiscussion } from '../src/interactions/handlers/closeDiscussion.js';

// Security audit 2026-11, B-05: the one button handler that did not ask who pressed it.
test('close discussion: a stranger is refused and the thread is not touched', async () => {
  const guild = fakeGuild({ id: 'g-close-discussion' });
  const client = fakeMember(guild, { name: 'Alice' });
  const stranger = fakeMember(guild);
  const channel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: channel.id });

  let fetched = 0;
  const discord = fakeClient([channel]);
  const realFetch = discord.channels.fetch;
  discord.channels.fetch = async (id) => {
    fetched++;
    return realFetch(id);
  };

  const byStranger = fakeInteraction({ client: discord, member: stranger, guild });
  await handleCloseDiscussion(byStranger, ['close_discussion', ticketId, 'thread-1']);
  assert.equal(answerKind(byStranger), 'reply');
  assert.equal(fetched, 0, 'the thread is not even looked up');
});

test('close discussion: an unknown ticket is refused too', async () => {
  const guild = fakeGuild({ id: 'g-close-discussion-2' });
  const someone = fakeMember(guild);
  const discord = fakeClient([]);
  const interaction = fakeInteraction({ client: discord, member: someone, guild });
  await handleCloseDiscussion(interaction, ['close_discussion', 'no-such-ticket', 'thread-1']);
  assert.equal(answerKind(interaction), 'reply');
});
