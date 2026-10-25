import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeClient, fakeInteraction, answerKind, finalText } from './helpers/fakes.js';
import { handleConfirmTicket } from '../src/interactions/handlers/confirmTicket.js';
import { getTicketByClientChannelId } from '../src/modules/tickets/TicketRepository.js';

test('Confirm creates a private order channel and answers through defer + editReply', async () => {
  const staff = fakeRole('Staff');
  const guild = fakeGuild({ id: 'g-ticket-create', roles: [staff] });
  setSetting(guild.id, 'category_active_orders', 'orders-cat');
  setSetting(guild.id, 'role_manager', staff.id);
  const client = fakeMember(guild, { name: 'Alice' });
  const i = fakeInteraction({ client: fakeClient(), member: client, guild });

  await handleConfirmTicket(i, ['confirm_ticket', 'order']);

  assert.equal(answerKind(i), 'deferUpdate');
  assert.match(finalText(i), /Ticket created/);

  const [channel] = guild.createdChannels;
  assert.equal(channel.name, 'order-alice');
  assert.equal(channel.parentId, 'orders-cat');
  const overwrites = channel.permissionOverwritesOnCreate;
  assert.ok(overwrites.some((o) => o.id === guild.id && o.deny === PermissionFlagsBits.ViewChannel), 'hidden from @everyone');
  assert.ok(overwrites.some((o) => o.id === client.id), 'visible to the client');
  assert.ok(overwrites.some((o) => o.id === staff.id), 'visible to the configured manager role');

  const ticket = getTicketByClientChannelId(channel.id);
  assert.equal(ticket.client_id, client.id);
  assert.equal(channel.sent.length, 2, 'welcome message + Fill order form button');
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
