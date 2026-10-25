import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind, answerText } from './helpers/fakes.js';
import { handleSubmitQuote } from '../src/interactions/handlers/submitQuote.js';
import { handleSubmitQuoteModal } from '../src/interactions/handlers/submitQuoteModal.js';
import { getProposalsByTicketId } from '../src/modules/proposals/ProposalRepository.js';

const QUOTE_FIELDS = { quote_deadline: '2026-12-01', quote_price: '€300', quote_message: 'Hi' };

function setup(guildId, { assigned = false } = {}) {
  const guild = fakeGuild({ id: guildId });
  const client = fakeMember(guild);
  const first = fakeMember(guild, { name: 'First' });
  const late = fakeMember(guild, { name: 'Late' });
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({
    guildId: guild.id,
    clientId: client.id,
    clientChannelId: clientChannel.id,
    freelancerChannelId: quoteChannel.id,
    assignedFreelancerId: assigned ? first.id : undefined,
  });
  return { guild, first, late, clientChannel, quoteChannel, ticketId, discord: fakeClient([clientChannel, quoteChannel]) };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });

test('no new quotes once a freelancer has been picked', async () => {
  const s = setup('g-quote-assigned', { assigned: true });

  const click = as(s, s.late);
  await handleSubmitQuote(click, ['submit_quote', s.ticketId]);
  assert.equal(answerKind(click), 'reply');
  assert.match(answerText(click), /already/i);

  const modal = as(s, s.late, { fields: QUOTE_FIELDS });
  await handleSubmitQuoteModal(modal, ['submit_quote_modal', s.ticketId]);
  assert.equal(getProposalsByTicketId(s.ticketId).length, 1, 'only the accepted proposal exists');
  assert.equal(s.clientChannel.sent.length, 0, 'client got no late quote');
});

test('one pending quote per freelancer', async () => {
  const s = setup('g-quote-dup');
  await handleSubmitQuoteModal(as(s, s.first, { fields: QUOTE_FIELDS }), ['submit_quote_modal', s.ticketId]);

  const again = as(s, s.first, { fields: QUOTE_FIELDS });
  await handleSubmitQuoteModal(again, ['submit_quote_modal', s.ticketId]);
  assert.match(answerText(again), /already sent a quote/i);
  assert.equal(getProposalsByTicketId(s.ticketId).length, 1);
});
