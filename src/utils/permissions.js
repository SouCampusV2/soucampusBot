/**
 * Role/channel permission helpers.
 */

import { ROLES } from '../constants.js';
import { getSetting } from '../core/GuildConfig.js';

/**
 * Check if member has a role by name.
 * @param {import('discord.js').GuildMember} member
 * @param {string} roleName
 * @returns {boolean}
 */
export function hasRole(member, roleName) {
  if (!member || !member.roles) return false;
  return member.roles.cache.some((r) => r.name === roleName);
}

/**
 * Get guild role by name.
 * @param {import('discord.js').Guild} guild
 * @param {string} roleName
 * @returns {import('discord.js').Role | undefined}
 */
export function getRoleByName(guild, roleName) {
  return guild.roles.cache.find((r) => r.name === roleName);
}

/**
 * Get the Manager role: by ROLE_MANAGER_ID from .env, or by name "Manager".
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Role | undefined}
 */
export function getManagerRole(guild) {
  const id = getSetting(guild.id, 'role_manager');
  if (id) return guild.roles.cache.get(id) ?? undefined;
  return getRoleByName(guild, ROLES.MANAGER);
}

/**
 * Get the Freelancer role: by ROLE_FREELANCER_ID from .env, or by name "Freelancer".
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Role | undefined}
 */
export function getFreelancerRole(guild) {
  const id = getSetting(guild.id, 'role_freelancer');
  if (id) return guild.roles.cache.get(id) ?? undefined;
  return getRoleByName(guild, ROLES.FREELANCER);
}

/**
 * Check if member is manager or admin.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
export function isManagerOrAdmin(member) {
  return hasRole(member, ROLES.MANAGER) || hasRole(member, ROLES.ADMIN);
}
