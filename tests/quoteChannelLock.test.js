import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeRole } from './helpers/fakes.js';
import { attachQuoteChannelLock } from '../src/modules/tickets/QuoteChannelLock.js';
import { createProposal, acceptProposal } from '../src/modules/proposals/ProposalRepository.js';

const settle = () => new Promise((r) => setImmediate(r));

function setup(guildId, { sameRole = false } = {}) {
  const freelancer = fakeRole('Freelancer');
  const manager = sameRole ? freelancer : fakeRole('Manager');
  const guild = fakeGuild({ id: guildId, roles: sameRole ? [freelancer] : [freelancer, manager] });
  setSetting(guild.id, 'role_freelancer', freelancer.id);
  setSetting(guild.id, 'role_manager', manager.id);
  const client = fakeMember(guild);
  const builder = fakeMember(guild, { roles: [freelancer] });
  const clientChannel = fakeChannel(guild);
  const quoteChannel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: clientChannel.id, freelancerChannelId: quoteChannel.id });
  return { freelancer, builder, quoteChannel, ticketId, discord: fakeClient([clientChannel, quoteChannel]) };
}

function assign(s) {
  const { id } = createProposal({ ticketId: s.ticketId, freelancerId: s.builder.id, price: '€550', deadline: '', message: '' });
  acceptProposal(id, s.ticketId, s.builder.id);
}

test('assigned order: the Freelancer role loses the quote channel, the builder keeps it', async () => {
  const s = setup('g-qlock');
  const detach = attachQuoteChannelLock(s.discord);
  try {
    assign(s);
    await settle();
    await settle();
  } finally {
    detach();
  }
  const ow = s.quoteChannel.overwrites;
  assert.deepEqual(ow.find((o) => o.target === s.builder.id)?.perms, { ViewChannel: true, SendMessages: true });
  assert.deepEqual(ow.find((o) => o.target === s.freelancer.id)?.perms, { ViewChannel: false });
  assert.ok(ow.findIndex((o) => o.target === s.builder.id) < ow.findIndex((o) => o.target === s.freelancer.id), 'builder first');
});

test('one role for managers and builders: the channel is not hidden from it', async () => {
  const s = setup('g-qlock-same', { sameRole: true });
  const detach = attachQuoteChannelLock(s.discord);
  try {
    assign(s);
    await settle();
    await settle();
  } finally {
    detach();
  }
  assert.ok(!s.quoteChannel.overwrites.some((o) => o.target === s.freelancer.id));
});

test('an open order without a builder is not touched', async () => {
  const s = setup('g-qlock-open');
  const detach = attachQuoteChannelLock(s.discord);
  await settle();
  detach();
  assert.equal(s.quoteChannel.overwrites.length, 0);
});
