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
 * Role ids saved for a setting. role_manager / role_freelancer may hold several ids separated
 * by commas (e.g. Moderator + Commission Team); an old single id reads as a list of one.
 * @param {string} guildId
 * @param {'role_manager' | 'role_freelancer'} key
 * @returns {string[]}
 */
export function roleIdsSetting(guildId, key) {
  const raw = getSetting(guildId, key);
  return raw ? raw.split(',').map((id) => id.trim()).filter(Boolean) : [];
}

/** Configured roles that still exist; with nothing configured, the role named `fallbackName`. */
function rolesFor(guild, key, fallbackName) {
  const ids = roleIdsSetting(guild.id, key);
  if (!ids.length) {
    const byName = getRoleByName(guild, fallbackName);
    return byName ? [byName] : [];
  }
  return ids.map((id) => guild.roles.cache.get(id)).filter(Boolean);
}

/**
 * Manager roles (/setup manager_role), or the role named "Manager" if none is set.
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Role[]}
 */
export function getManagerRoles(guild) {
  return rolesFor(guild, 'role_manager', ROLES.MANAGER);
}

/**
 * Builder roles (/setup freelancer_role), or the role named "Freelancer" if none is set.
 * The first one is the main role: it is given when a team application is accepted.
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Role[]}
 */
export function getBuilderRoles(guild) {
  return rolesFor(guild, 'role_freelancer', ROLES.FREELANCER);
}

/**
 * Builder roles that are not also manager roles — the ones to hide from or lock out of a
 * channel without hiding it from managers.
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').Role[]}
 */
export function getBuilderOnlyRoles(guild) {
  const managerIds = new Set(getManagerRoles(guild).map((r) => r.id));
  return getBuilderRoles(guild).filter((r) => !managerIds.has(r.id));
}

/**
 * True if the member has any builder role.
 * @param {import('discord.js').GuildMember} member
 */
export function isBuilder(member) {
  if (!member?.roles || !member.guild) return false;
  return getBuilderRoles(member.guild).some((r) => member.roles.cache.has(r.id));
}

/**
 * Check if member is manager or admin — the ONLY place that decides manager access.
 * Manager = server Administrator permission, or any role set via /setup manager_role.
 *
 * A role NAME grants nothing (security audit 2026-11, B-04). Until 2026-11-12 a role called
 * "Manager" or "Admin" counted while no manager role was configured — so on such a server
 * anyone allowed to manage roles could create a role with that name, give it to themselves
 * and confirm payments. With no role configured, only server Administrators are managers:
 * run /setup manager_role.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
export function isManagerOrAdmin(member) {
  if (!member?.roles) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const configured = member.guild ? roleIdsSetting(member.guild.id, 'role_manager') : [];
  return configured.some((id) => member.roles.cache.has(id));
}
