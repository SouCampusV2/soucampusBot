import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction } from './helpers/fakes.js';
import { refreshOrderCard, attachOrderCard } from '../src/modules/tickets/OrderCard.js';
import { handleSubmitQuoteModal } from '../src/interactions/handlers/submitQuoteModal.js';
import { createProposal } from '../src/modules/proposals/ProposalRepository.js';
import { createReview } from '../src/modules/reviews/ReviewRepository.js';
import { STATUS, transitionTicket } from '../src/modules/tickets/TicketStatus.js';
import { run } from '../src/core/Database.js';

function setup(guildId, opts = {}) {
  const guild = fakeGuild({ id: guildId });
  const client = fakeMember(guild, { name: 'Alice' });
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({
    guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, freelancerChannelId: quoteChannel.id,
    fields: { size: '150x150', budget: '100-500' }, ...opts,
  });
  return { guild, client, clientChannel, quoteChannel, ticketId, discord: fakeClient([clientChannel, quoteChannel]) };
}

const cards = (channel) => [...channel.posted.values()].filter((m) => m.embeds?.[0]?.data?.title?.startsWith('Order ·'));
const cardText = (channel) => JSON.stringify(cards(channel).at(-1).embeds[0].data);

test('an open order gets one card with stage, estimate and quote activity, edited in place', async () => {
  const s = setup('g-card-open');
  createProposal({ ticketId: s.ticketId, freelancerId: 'f1', price: '€250', deadline: '', message: '' });
  await refreshOrderCard(s.discord, s.ticketId);
  createProposal({ ticketId: s.ticketId, freelancerId: 'f2', price: '€200', deadline: '', message: '' });
  await refreshOrderCard(s.discord, s.ticketId);

  assert.equal(cards(s.clientChannel).length, 1, 'one card, edited — not a new message each time');
  const text = cardText(s.clientChannel);
  assert.match(text, /Collecting quotes/);
  assert.match(text, /2 received/);
  assert.match(text, /~€225/, 'estimate from the site formula for 150x150');
  assert.match(text, /€100–€500/, 'budget shown with its label, not the raw value');
});

test('after Accept the card shows the freelancer and the agreed price', async () => {
  const s = setup('g-card-assigned', { assignedFreelancerId: 'f9' });
  await refreshOrderCard(s.discord, s.ticketId);
  const text = cardText(s.clientChannel);
  assert.match(text, /<@f9>/);
  assert.match(text, /€200/, 'price from the accepted proposal');
  assert.match(text, /Waiting for payment/);
});

test('no card while the client is still filling the form', async () => {
  const s = setup('g-card-form', { inForm: true });
  await refreshOrderCard(s.discord, s.ticketId);
  assert.equal(cards(s.clientChannel).length, 0);
});

test('a status change refreshes the card through the event bus', async () => {
  const s = setup('g-card-events', { assignedFreelancerId: 'f7' });
  const detach = attachOrderCard(s.discord);
  try {
    transitionTicket(s.ticketId, STATUS.PAID);
    await tick();
    await tick();
    assert.match(cardText(s.clientChannel), /In progress/);
  } finally {
    detach();
  }
});

test('a quote shows the freelancer\'s track record on this server', async () => {
  const s = setup('g-card-stats');
  const pro = fakeMember(s.guild, { name: 'Pro' });
  // Two delivered orders, rated 5 and 4, on this server.
  for (const rating of [5, 4]) {
    const done = seedOrder({ guildId: s.guild.id, clientId: 'x', clientChannelId: `c-${rating}`, assignedFreelancerId: pro.id, completed: true });
    createReview({ ticketId: done, clientId: 'x', freelancerId: pro.id, rating, comment: '' });
  }
  const i = fakeInteraction({
    client: s.discord, member: pro, guild: s.guild,
    fields: { quote_deadline: '2026-12-01', quote_price: '€230', quote_message: '' },
  });
  await handleSubmitQuoteModal(i, ['submit_quote_modal', s.ticketId]);
  const quote = s.clientChannel.sent.find((m) => m.content?.includes('New quote'));
  assert.match(JSON.stringify(quote.embeds[0].data), /4\.5.*2 reviews.*2 orders delivered/);
});

test('a first-time freelancer is shown as new, not as zero stars', async () => {
  const s = setup('g-card-newbie');
  const rookie = fakeMember(s.guild, { name: 'Rookie' });
  run('DELETE FROM reviews WHERE freelancer_id = ?', [rookie.id]);
  const i = fakeInteraction({
    client: s.discord, member: rookie, guild: s.guild,
    fields: { quote_deadline: '', quote_price: '€100', quote_message: '' },
  });
  await handleSubmitQuoteModal(i, ['submit_quote_modal', s.ticketId]);
  const quote = s.clientChannel.sent.find((m) => m.content?.includes('New quote'));
  assert.match(JSON.stringify(quote.embeds[0].data), /New on this server/);
});
