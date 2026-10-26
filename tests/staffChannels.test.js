import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeClient, fakeInteraction, finalText } from './helpers/fakes.js';
import { handleSetupCommand } from '../src/commands/setupCommand.js';

async function run(guild) {
  const i = fakeInteraction({ client: fakeClient(), member: fakeMember(guild, { admin: true }), guild });
  i.isChatInputCommand = () => true;
  i.commandName = 'setup';
  i.options = { getSubcommand: () => 'staff_channels' };
  await handleSetupCommand(i);
  return finalText(i);
}

const rule = (channel, id) => channel.permissionOverwritesOnCreate.find((o) => o.id === id);
const has = (bits, flag) => (BigInt(bits ?? 0) & flag) === flag;

test('/setup staff_channels: hidden from everyone, managers and builders inside, builders only read announcements', async () => {
  const managers = fakeRole('Managers');
  const builders = fakeRole('Builders');
  const guild = fakeGuild({ id: 'g-staff', roles: [managers, builders] });
  setSetting(guild.id, 'role_manager', managers.id);
  setSetting(guild.id, 'role_freelancer', builders.id);

  assert.match(await run(guild), /created/);
  const [category, announcements, chat] = guild.createdChannels;
  assert.equal(category.type, ChannelType.GuildCategory);
  assert.equal(announcements.name, 'staff-announcements');
  assert.equal(chat.name, 'staff-chat');
  for (const channel of [announcements, chat]) {
    assert.equal(channel.parentId, category.id);
    assert.ok(has(rule(channel, guild.id).deny, PermissionFlagsBits.ViewChannel), 'hidden from @everyone (clients)');
    assert.ok(has(rule(channel, managers.id).allow, PermissionFlagsBits.SendMessages), 'managers write');
    assert.ok(has(rule(channel, builders.id).allow, PermissionFlagsBits.ViewChannel), 'builders see');
  }
  assert.ok(has(rule(announcements, builders.id).deny, PermissionFlagsBits.SendMessages), 'builders only read announcements');
  assert.ok(has(rule(chat, builders.id).allow, PermissionFlagsBits.SendMessages), 'builders write in the chat');

  assert.match(await run(guild), /already exist/);
  assert.equal(guild.createdChannels.length, 3, 'running it again creates nothing new');
});

test('/setup staff_channels refuses without the manager and builder roles', async () => {
  const guild = fakeGuild({ id: 'g-staff-noroles' });
  assert.match(await run(guild), /manager_role/);
  assert.equal(guild.createdChannels.length, 0);
});
