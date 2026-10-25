import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind, answerText } from './helpers/fakes.js';
import { handleSubmitReview } from '../src/interactions/handlers/submitReview.js';
import { handleSubmitReviewModal } from '../src/interactions/handlers/submitReviewModal.js';
import { query } from '../src/core/Database.js';

function setup(guildId) {
  const guild = fakeGuild({ id: guildId });
  const client = fakeMember(guild, { name: 'Alice' });
  const freelancer = fakeMember(guild, { name: 'Bob' });
  const clientChannel = fakeChannel(guild);
  const reviewsChannel = fakeChannel(guild);
  setSetting(guild.id, 'channel_reviews', reviewsChannel.id);
  const ticketId = seedOrder({
    guildId: guild.id,
    clientId: client.id,
    clientChannelId: clientChannel.id,
    assignedFreelancerId: freelancer.id,
    paid: true,
    completed: true,
  });
  const discord = fakeClient([clientChannel, reviewsChannel]);
  return { guild, client, clientChannel, reviewsChannel, ticketId, discord };
}

const submit = (s, rating = '5') =>
  fakeInteraction({
    client: s.discord,
    member: s.client,
    guild: s.guild,
    fields: { review_rating: rating, review_comment: 'Great castle' },
  });

test('a client can leave exactly one review per order', async () => {
  const s = setup('g-review-once');

  const first = submit(s);
  await handleSubmitReviewModal(first, ['submit_review_modal', s.ticketId]);
  assert.match(answerText(first), /thank you/i);

  const second = submit(s, '1');
  await handleSubmitReviewModal(second, ['submit_review_modal', s.ticketId]);
  assert.match(answerText(second), /already/i);

  const rows = query('SELECT * FROM reviews WHERE ticket_id = ?', [s.ticketId]);
  assert.equal(rows.length, 1);
  assert.equal(s.reviewsChannel.sent.length, 1);
});

test('the Leave Review button does not open the form again after a review', async () => {
  const s = setup('g-review-button');
  await handleSubmitReviewModal(submit(s), ['submit_review_modal', s.ticketId]);

  const click = fakeInteraction({ client: s.discord, member: s.client, guild: s.guild });
  await handleSubmitReview(click, ['submit_review', s.ticketId]);
  assert.equal(answerKind(click), 'reply');
  assert.match(answerText(click), /already/i);
});
