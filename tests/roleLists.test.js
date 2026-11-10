import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole, fakeChannel, fakeClient, fakeInteraction, answerText } from './helpers/fakes.js';
import { isManagerOrAdmin, isBuilder, getBuilderRoles, getBuilderOnlyRoles } from '../src/utils/permissions.js';
import { handleSetupCommand } from '../src/commands/setupCommand.js';
import { getSetting } from '../src/core/GuildConfig.js';
import { closeQuoteChannelToBuilders } from '../src/modules/tickets/QuoteChannelLock.js';

function roles(guildId) {
  const r = { moderator: fakeRole('Moderator'), commission: fakeRole('Commission Team'), builders: fakeRole('Builders'), trial: fakeRole('Trial Builder') };
  const guild = fakeGuild({ id: guildId, roles: Object.values(r) });
  setSetting(guild.id, 'role_manager', `${r.moderator.id},${r.commission.id}`);
  setSetting(guild.id, 'role_freelancer', `${r.builders.id},${r.trial.id}`);
  return { guild, r };
}

test('every configured manager role counts as manager; a builder does not', () => {
  const { guild, r } = roles('g-roles-mgr');
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [r.moderator] })), true);
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [r.commission] })), true);
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [r.builders] })), false);
});

test('every configured builder role counts as builder; the first is the main one', () => {
  const { guild, r } = roles('g-roles-bld');
  assert.equal(isBuilder(fakeMember(guild, { roles: [r.trial] })), true);
  assert.equal(isBuilder(fakeMember(guild, { roles: [r.moderator] })), false);
  assert.equal(getBuilderRoles(guild)[0].id, r.builders.id);
});

test('an old single role id still works', () => {
  const staff = fakeRole('Staff');
  const guild = fakeGuild({ id: 'g-roles-legacy', roles: [staff] });
  setSetting(guild.id, 'role_manager', staff.id);
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [staff] })), true);
});

test('a role in both lists is never hidden as a builder role', () => {
  const { guild, r } = roles('g-roles-both');
  setSetting(guild.id, 'role_freelancer', `${r.builders.id},${r.commission.id}`);
  assert.deepEqual(getBuilderOnlyRoles(guild).map((x) => x.id), [r.builders.id]);
});

test('assigned order: every builder role loses the quote channel, manager roles are not touched', async () => {
  const { guild, r } = roles('g-roles-lock');
  const channel = fakeChannel(guild);
  await closeQuoteChannelToBuilders(channel, 'builder-1');
  const hidden = channel.overwrites.filter((o) => o.perms.ViewChannel === false).map((o) => o.target);
  assert.deepEqual(hidden.sort(), [r.builders.id, r.trial.id].sort());
  assert.ok(!channel.overwrites.some((o) => [r.moderator.id, r.commission.id].includes(o.target)));
});

function setupCmd(guild, member, sub, picked) {
  const channel = fakeChannel(guild);
  const i = fakeInteraction({ client: fakeClient([channel]), member, guild, channel });
  i.isChatInputCommand = () => true;
  i.commandName = 'setup';
  i.options = { getSubcommand: () => sub, getRole: (k) => picked[k] ?? null, getString: () => null, getChannel: () => null, getBoolean: () => null };
  return i;
}

test('/setup manager_role saves all given roles, replacing the old list', async () => {
  const { guild, r } = roles('g-roles-setup');
  const i = setupCmd(guild, fakeMember(guild, { admin: true }), 'manager_role', { role: r.commission, role3: r.moderator, role4: r.commission });
  await handleSetupCommand(i);
  assert.equal(getSetting(guild.id, 'role_manager'), `${r.commission.id},${r.moderator.id}`);
  assert.match(answerText(i), /Manager roles/);
});

test('/setup manager_role: a non-admin is refused and nothing changes', async () => {
  const { guild, r } = roles('g-roles-setup-deny');
  const before = getSetting(guild.id, 'role_manager');
  const i = setupCmd(guild, fakeMember(guild, { roles: [r.moderator] }), 'manager_role', { role: r.builders });
  await handleSetupCommand(i);
  assert.match(answerText(i), /only server administrators/i);
  assert.equal(getSetting(guild.id, 'role_manager'), before);
});
