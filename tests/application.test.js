import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeChannel, fakeClient, fakeInteraction, answerKind, answerText } from './helpers/fakes.js';
import { handleConfirmTicket } from '../src/interactions/handlers/confirmTicket.js';
import {
  handleStartApplication,
  handleApplicationModal,
  handleAcceptApplication,
  handleRejectApplication,
  handleRejectApplicationModal,
} from '../src/modules/tickets/flows/ApplicationFlow.js';
import { getTicketByClientChannelId, getTicketFields } from '../src/modules/tickets/TicketRepository.js';

const FORM = {
  field_about: 'I build medieval maps',
  field_experience: '3 years, 40 maps',
  field_specialty: 'Medieval, terrain',
  field_timezone: 'UTC+2',
  field_portfolio: 'https://example.com/portfolio',
};

async function setup(guildId) {
  const staff = fakeRole('Staff');
  const builders = fakeRole('Builders');
  const guild = fakeGuild({ id: guildId, roles: [staff, builders] });
  setSetting(guild.id, 'category_active_orders', 'tickets-cat');
  setSetting(guild.id, 'role_manager', staff.id);
  setSetting(guild.id, 'role_freelancer', builders.id);
  const manager = fakeMember(guild, { roles: [staff], name: 'Boss' });
  const applicant = fakeMember(guild, { name: 'Steve' });
  const stranger = fakeMember(guild, { name: 'Mallory' });
  const discord = fakeClient();

  await handleConfirmTicket(fakeInteraction({ client: discord, member: applicant, guild }), ['confirm_ticket', 'application']);
  const [channel] = guild.createdChannels;
  discord.channels.fetch = async (id) => (id === channel.id ? channel : null);
  const ticket = getTicketByClientChannelId(channel.id);
  return { guild, builders, manager, applicant, stranger, discord, channel, ticketId: ticket.id };
}

const as = (s, member, extra = {}) => fakeInteraction({ client: s.discord, member, guild: s.guild, ...extra });

test('applying opens apply-<name> with a Fill application button', async () => {
  const s = await setup('g-app-open');
  assert.equal(s.channel.name, 'apply-steve');
  const buttons = s.channel.sent.flatMap((m) => m.components ?? []).flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.ok(buttons.includes(`start_application:${s.ticketId}`));
});

test('only the applicant can fill the application', async () => {
  const s = await setup('g-app-door');
  const i = as(s, s.stranger, { fields: FORM });
  await handleApplicationModal(i, ['application_modal', s.ticketId]);
  assert.equal(answerKind(i), 'reply');
  assert.equal(getTicketFields(s.ticketId).length, 0);

  const open = as(s, s.stranger);
  await handleStartApplication(open, ['start_application', s.ticketId]);
  assert.equal(answerKind(open), 'reply');
});

test('a submitted application is saved and shown to managers with Accept / Reject', async () => {
  const s = await setup('g-app-submit');
  await handleApplicationModal(as(s, s.applicant, { fields: FORM }), ['application_modal', s.ticketId]);
  assert.equal(getTicketFields(s.ticketId).find((f) => f.field_name === 'app_portfolio').field_value, FORM.field_portfolio);
  const summary = s.channel.sent.at(-1);
  assert.match(JSON.stringify(summary.embeds[0].data), /medieval maps/);
  const ids = summary.components.flatMap((row) => row.components.map((c) => c.data.custom_id));
  assert.deepEqual(ids.sort(), [`accept_application:${s.ticketId}`, `reject_application:${s.ticketId}`, `start_application:${s.ticketId}`].sort());
});

test('Accept gives the Freelancer role; only a manager can, and only once', async () => {
  const s = await setup('g-app-accept');
  await handleApplicationModal(as(s, s.applicant, { fields: FORM }), ['application_modal', s.ticketId]);

  const byApplicant = as(s, s.applicant);
  await handleAcceptApplication(byApplicant, ['accept_application', s.ticketId]);
  assert.equal(answerKind(byApplicant), 'reply');
  assert.equal(s.applicant.roles.cache.has(s.builders.id), false);

  const byManager = as(s, s.manager);
  await handleAcceptApplication(byManager, ['accept_application', s.ticketId]);
  assert.equal(answerKind(byManager), 'update');
  assert.equal(s.applicant.roles.cache.has(s.builders.id), true);
  assert.ok(s.discord.dms.some((d) => d.to === s.applicant.id && /accepted/i.test(d.content)));

  const again = as(s, s.manager);
  await handleAcceptApplication(again, ['accept_application', s.ticketId]);
  assert.match(answerText(again), /already/i);
});

test('Reject asks for a reason and sends it to the applicant', async () => {
  const s = await setup('g-app-reject');
  await handleApplicationModal(as(s, s.applicant, { fields: FORM }), ['application_modal', s.ticketId]);

  const open = as(s, s.manager);
  await handleRejectApplication(open, ['reject_application', s.ticketId]);
  assert.equal(answerKind(open), 'showModal');

  await handleRejectApplicationModal(as(s, s.manager, { fields: { reject_reason: 'Portfolio too small' } }), ['reject_application_modal', s.ticketId]);
  assert.ok(s.discord.dms.some((d) => d.to === s.applicant.id && /Portfolio too small/.test(d.content)));
  assert.equal(s.applicant.roles.cache.has(s.builders.id), false);
});

test('the reject modal re-checks for a manager', async () => {
  const s = await setup('g-app-reject-door');
  await handleApplicationModal(as(s, s.applicant, { fields: FORM }), ['application_modal', s.ticketId]);
  const i = as(s, s.applicant, { fields: { reject_reason: 'self-reject' } });
  await handleRejectApplicationModal(i, ['reject_application_modal', s.ticketId]);
  assert.equal(answerKind(i), 'reply');
  assert.ok(!s.discord.dms.some((d) => /self-reject/.test(d.content)));
});

test('help tickets get a help-<name> channel', async () => {
  const guild = fakeGuild({ id: 'g-help-name' });
  setSetting(guild.id, 'category_active_orders', 'cat');
  const member = fakeMember(guild, { name: 'Alex' });
  await handleConfirmTicket(fakeInteraction({ client: fakeClient(), member, guild }), ['confirm_ticket', 'help']);
  assert.equal(guild.createdChannels[0].name, 'help-alex');
});
