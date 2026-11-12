import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSetting } from './helpers/db.js';
import { fakeGuild, fakeMember, fakeRole } from './helpers/fakes.js';
import { isManagerOrAdmin } from '../src/utils/permissions.js';

test('the role set via /setup manager_role counts as manager, whatever its name', () => {
  const staff = fakeRole('Staff');
  const guild = fakeGuild({ id: 'g-perm-configured', roles: [staff] });
  setSetting(guild.id, 'role_manager', staff.id);
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [staff] })), true);
});

test('a server Administrator counts as manager without any role', () => {
  const guild = fakeGuild({ id: 'g-perm-admin' });
  assert.equal(isManagerOrAdmin(fakeMember(guild, { admin: true })), true);
});

// Security audit 2026-11, B-04: this test used to assert the opposite. A name is something
// anyone with Manage Roles can hand out, so it must never decide who confirms payments.
test('a role named "Manager" or "Admin" grants nothing when no manager role is configured', () => {
  const manager = fakeRole('Manager');
  const admin = fakeRole('Admin');
  const guild = fakeGuild({ id: 'g-perm-byname', roles: [manager, admin] });
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [manager] })), false);
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [admin] })), false);
  assert.equal(isManagerOrAdmin(fakeMember(guild, { admin: true })), true, 'Administrators still are');
});

test('a role named "Manager" does not count once another manager role is configured', () => {
  const staff = fakeRole('Staff');
  const fakeManager = fakeRole('Manager');
  const guild = fakeGuild({ id: 'g-perm-impostor', roles: [staff, fakeManager] });
  setSetting(guild.id, 'role_manager', staff.id);
  assert.equal(isManagerOrAdmin(fakeMember(guild, { roles: [fakeManager] })), false);
});

test('a regular member is not a manager', () => {
  const guild = fakeGuild({ id: 'g-perm-regular' });
  assert.equal(isManagerOrAdmin(fakeMember(guild)), false);
});

test('no member means no access', () => {
  assert.equal(isManagerOrAdmin(null), false);
});
