import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { seedOrder } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeChannel, fakeClient, fakeInteraction, answerKind } from './helpers/fakes.js';
import { signBody, enqueue, flushOutbox, pendingCount, buildPortfolioDraft, bridgeAllowsGuild } from '../src/modules/site/SiteBridge.js';
import { handleSiteConsent } from '../src/modules/site/consent.js';
import { createReview } from '../src/modules/reviews/ReviewRepository.js';
import { getTicketById } from '../src/modules/tickets/TicketRepository.js';
import { query } from '../src/core/Database.js';

// The same vector is asserted on the site side (docs/phase4/site/discord-bridge.test.ts):
// if either side changes the signing scheme, one of the two tests goes red.
test('signature: hex HMAC-SHA256 of "<timestamp>.<body>" — fixed test vector', () => {
  assert.equal(
    signBody('test-secret', '1767225600', '{"hello":"world"}'),
    'adb73f4965c2de3ba36a1ece69109fa5109777bdc9ca68c576458eb8004a2ed5'
  );
});

const okFetch = () => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => '{"ok":true}' };
  };
  fn.calls = calls;
  return fn;
};

const config = { url: 'https://site.test/api/discord/bridge', secret: 'test-secret' };

test('the outbox sends signed JSON once and marks it sent', async () => {
  enqueue('review', 'review:t-send', { rating: 5 });
  const fetchFn = okFetch();
  await flushOutbox({ config, fetchFn, now: 1767225600000 });
  const call = fetchFn.calls.find((c) => JSON.parse(c.init.body).key === 'review:t-send');
  assert.ok(call, 'sent');
  const ts = call.init.headers['x-bocampus-timestamp'];
  assert.equal(call.init.headers['x-bocampus-signature'], signBody('test-secret', ts, call.init.body));
  const before = fetchFn.calls.length;
  await flushOutbox({ config, fetchFn, now: 1767225600000 });
  assert.equal(fetchFn.calls.length, before, 'not sent twice');
});

test('enqueue is idempotent per key (double click on consent)', () => {
  enqueue('review', 'review:t-dup', { rating: 4 });
  enqueue('review', 'review:t-dup', { rating: 1 });
  const rows = query("SELECT payload FROM site_outbox WHERE key = 'review:t-dup'");
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].payload).rating, 4, 'first one wins');
});

test('a failing site is retried later with backoff, and the item is kept', async () => {
  enqueue('review', 'review:t-fail', { rating: 3 });
  const failing = async () => ({ ok: false, status: 503, text: async () => 'down' });
  await flushOutbox({ config, fetchFn: failing, now: 1_000_000 });
  const row = query("SELECT * FROM site_outbox WHERE key = 'review:t-fail'")[0];
  assert.equal(row.attempts, 1);
  assert.ok(row.next_attempt_at > 1_000_000, 'not retried immediately');
  assert.equal(row.sent_at, null);
  assert.match(row.last_error, /503/);
});

test('no site configured: nothing is sent, items wait for the configuration', async () => {
  enqueue('review', 'review:t-wait', { rating: 5 });
  const fetchFn = okFetch();
  await flushOutbox({ config: { url: '', secret: '' }, fetchFn });
  assert.equal(fetchFn.calls.length, 0);
  assert.ok(pendingCount() >= 1);
});

test('portfolio draft: build facts and the freelancer\'s screenshots, never the client\'s name', async () => {
  const guild = fakeGuild({ id: 'g-bridge-draft' });
  const channel = fakeChannel(guild);
  const ticketId = seedOrder({
    guildId: guild.id, clientId: 'alice', clientChannelId: channel.id, assignedFreelancerId: 'bob', completed: true,
    fields: { size: '200x200', theme: 'Medieval spawn', version: '1.21' },
  });
  const img = (id, name) => [id, { name, url: `https://cdn.discordapp.com/${name}`, contentType: 'image/png' }];
  channel.messages.fetch = async () =>
    new Collection([
      ['1', { id: '1', author: { id: 'bob' }, attachments: new Collection([img('a', 'shot1.png')]) }],
      ['2', { id: '2', author: { id: 'alice' }, attachments: new Collection([img('b', 'client-ref.png')]) }],
      ['3', { id: '3', author: { id: 'bob' }, attachments: new Collection([['c', { name: 'world.zip', url: 'x', contentType: 'application/zip' }]]) }],
    ]);
  const draft = await buildPortfolioDraft(fakeClient([channel]), getTicketById(ticketId));
  assert.equal(draft.sizeLabel, '200×200');
  assert.equal(draft.theme, 'Medieval spawn');
  assert.equal(draft.priceAmount, 200);
  assert.deepEqual(draft.images, ['https://cdn.discordapp.com/shot1.png'], 'only the freelancer’s images, no zips');
  assert.doesNotMatch(JSON.stringify(draft), /alice/i);
});

test('consent buttons: only the client can answer, and the answer is recorded once', async () => {
  const guild = fakeGuild({ id: 'g-bridge-consent' });
  const client = fakeMember(guild, { name: 'Alice' });
  const stranger = fakeMember(guild);
  const channel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: channel.id, assignedFreelancerId: 'bob', completed: true });
  createReview({ ticketId, clientId: client.id, freelancerId: 'bob', rating: 5, comment: 'Great' });
  const discord = fakeClient([channel]);
  channel.messages.fetch = async () => new Collection();

  const byStranger = fakeInteraction({ client: discord, member: stranger, guild });
  await handleSiteConsent(byStranger, ['site_consent', ticketId, 'portfolio', 'yes']);
  assert.equal(answerKind(byStranger), 'reply');
  assert.equal(getTicketById(ticketId).portfolio_consent, null);

  const yes = fakeInteraction({ client: discord, member: client, guild });
  await handleSiteConsent(yes, ['site_consent', ticketId, 'portfolio', 'yes']);
  assert.equal(answerKind(yes), 'update');
  assert.equal(getTicketById(ticketId).portfolio_consent, 1);
  assert.equal(query('SELECT COUNT(*) n FROM site_outbox WHERE key = ?', [`portfolio:${ticketId}`])[0].n, 1);

  const review = fakeInteraction({ client: discord, member: client, guild });
  await handleSiteConsent(review, ['site_consent', ticketId, 'review', 'no']);
  assert.equal(query('SELECT site_consent FROM reviews WHERE ticket_id = ?', [ticketId])[0].site_consent, 0);
  assert.equal(query('SELECT COUNT(*) n FROM site_outbox WHERE key = ?', [`review:${ticketId}`])[0].n, 0, 'no = nothing sent');
});

// Security audit 2026-11, B-01: the bridge is tied to the owner's servers.
test('bridge guild list: SITE_BRIDGE_GUILDS wins, GUILD_ID is the fallback, empty means open', () => {
  assert.equal(bridgeAllowsGuild('1', { SITE_BRIDGE_GUILDS: '1, 2' }), true);
  assert.equal(bridgeAllowsGuild('3', { SITE_BRIDGE_GUILDS: '1, 2' }), false);
  assert.equal(bridgeAllowsGuild('3', { SITE_BRIDGE_GUILDS: '1', GUILD_ID: '3' }), false);
  assert.equal(bridgeAllowsGuild('3', { GUILD_ID: '3' }), true);
  assert.equal(bridgeAllowsGuild('4', { GUILD_ID: '3' }), false);
  assert.equal(bridgeAllowsGuild('4', {}), true);
});

test('consent from a server outside the bridge list is recorded but not sent', async () => {
  const guild = fakeGuild({ id: 'g-bridge-foreign' });
  const client = fakeMember(guild, { name: 'Mallory' });
  const channel = fakeChannel(guild);
  const ticketId = seedOrder({ guildId: guild.id, clientId: client.id, clientChannelId: channel.id, assignedFreelancerId: 'bob', completed: true });
  const discord = fakeClient([channel]);
  channel.messages.fetch = async () => new Collection();

  const before = process.env.SITE_BRIDGE_GUILDS;
  process.env.SITE_BRIDGE_GUILDS = 'g-home-only';
  try {
    const yes = fakeInteraction({ client: discord, member: client, guild });
    await handleSiteConsent(yes, ['site_consent', ticketId, 'portfolio', 'yes']);
    assert.equal(getTicketById(ticketId).portfolio_consent, 1, 'the answer itself is kept');
    assert.equal(query('SELECT COUNT(*) n FROM site_outbox WHERE key = ?', [`portfolio:${ticketId}`])[0].n, 0, 'nothing queued for the site');
  } finally {
    if (before === undefined) delete process.env.SITE_BRIDGE_GUILDS;
    else process.env.SITE_BRIDGE_GUILDS = before;
  }
});
