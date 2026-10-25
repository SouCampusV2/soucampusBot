/**
 * Role/channel permission helpers.
 */

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
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
 * Reply-and-stop guard: true if the interaction user is the ticket's client.
 * Otherwise answers with an ephemeral refusal and returns false.
 * @param {import('discord.js').Interaction} interaction
 * @param {{ client_id: string }} ticket
 * @returns {Promise<boolean>}
 */
export async function ensureTicketClient(interaction, ticket) {
  if (ticket?.client_id === interaction.user.id) return true;
  await interaction.reply({ content: 'Only the client who opened this order can do that.', flags: MessageFlags.Ephemeral });
  return false;
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
 * Check if member is manager or admin — the ONLY place that decides manager access.
 * Manager = server Administrator permission, or the role set via /setup manager_role.
 * Roles named "Manager"/"Admin" count only while no manager role is configured
 * (single-server legacy mode); once one is configured, a look-alike name grants nothing.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
export function isManagerOrAdmin(member) {
  if (!member?.roles) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const configuredRoleId = member.guild ? getSetting(member.guild.id, 'role_manager') : null;
  if (configuredRoleId) return member.roles.cache.has(configuredRoleId);
  return hasRole(member, ROLES.MANAGER) || hasRole(member, ROLES.ADMIN);
}
