import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { setSetting } from './helpers/db.js';
import { MessageFlags } from 'discord.js';
import { fakeGuild, fakeMember, fakeRole, fakeClient, fakeInteraction, answerKind, finalText, customIds, payloadText } from './helpers/fakes.js';
import { handleConfirmTicket } from '../src/interactions/handlers/confirmTicket.js';
import { getTicketByClientChannelId } from '../src/modules/tickets/TicketRepository.js';

test('Confirm creates a private ticket channel and answers through defer + editReply', async () => {
  const staff = fakeRole('Staff');
  const guild = fakeGuild({ id: 'g-ticket-create', roles: [staff] });
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  setSetting(guild.id, 'role_manager', staff.id);
  const client = fakeMember(guild, { name: 'Alice' });
  const i = fakeInteraction({ client: fakeClient(), member: client, guild });

  await handleConfirmTicket(i, ['confirm_ticket', 'help']);

  assert.equal(answerKind(i), 'deferUpdate');
  assert.match(finalText(i), /ticket is ready/);

  const [channel] = guild.createdChannels;
  assert.match(channel.name, /alice/);
  assert.equal(channel.parentId, 'orders-cat');
  const overwrites = channel.permissionOverwritesOnCreate;
  assert.ok(overwrites.some((o) => o.id === guild.id && o.deny === PermissionFlagsBits.ViewChannel), 'hidden from @everyone');
  assert.ok(overwrites.some((o) => o.id === client.id), 'visible to the client');
  assert.ok(overwrites.some((o) => o.id === staff.id), 'visible to the configured manager role');

  const ticket = getTicketByClientChannelId(channel.id);
  assert.equal(ticket.client_id, client.id);
  assert.equal(channel.sent.length, 1, 'one welcome card');
  const [welcome] = channel.sent;
  assert.equal(welcome.flags, MessageFlags.IsComponentsV2);
  assert.match(payloadText(welcome), new RegExp(`<@${client.id}>`), 'the card greets the client by mention');
  assert.deepEqual(customIds(welcome), [`close_ticket:${ticket.id}`]);
});

test('an order from the old type menu opens the order modal instead of an empty ticket', async () => {
  const guild = fakeGuild({ id: 'g-ticket-menu-order' });
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild), guild });
  await handleConfirmTicket(i, ['confirm_ticket', 'order']);
  assert.equal(answerKind(i), 'showModal');
  assert.equal(guild.createdChannels.length, 0);
});

test('an unknown ticket type in the customId is refused', async () => {
  const guild = fakeGuild({ id: 'g-ticket-badtype' });
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild), guild });
  await handleConfirmTicket(i, ['confirm_ticket', 'pizza']);
  assert.equal(answerKind(i), 'reply');
  assert.equal(guild.createdChannels.length, 0);
});

test('an unconfigured server gets a /setup hint instead of a crash', async () => {
  const guild = fakeGuild({ id: 'g-ticket-unconfigured' });
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild), guild });
  await handleConfirmTicket(i, ['confirm_ticket', 'help']);
  assert.match(finalText(i), /\/setup active_orders/);
});
