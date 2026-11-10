/**
 * Staff channels: a "Staff" category with #staff-announcements (managers post, builders read)
 * and #staff-chat (managers and builders talk). Hidden from everyone else, clients included.
 *
 * Made by /setup staff_channels. Run again, it does not duplicate: channels it made before are
 * found by their saved ids and only get their permissions re-applied — e.g. after the manager
 * or builder role changed in /setup.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getSetting, setSetting } from '../../core/GuildConfig.js';
import { getManagerRoles, getBuilderOnlyRoles } from '../../utils/permissions.js';

const READ = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
const WRITE = READ | PermissionFlagsBits.SendMessages | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.AddReactions;

/** Shown when a role is missing — without both, "only staff" cannot be expressed. */
export const STAFF_ROLES_MISSING =
  'Set both first: `/setup manager_role` and `/setup freelancer_role` (builder roles) — the staff channels are visible only to them.';

/** Who sees what. Builders only read announcements; the bot itself can always post. */
function overwrites(guild, botUserId, managerRoles, builderRoles, builderCanWrite) {
  return [
    { id: guild.id, deny: PermissionFlagsBits.ViewChannel },
    ...managerRoles.map((r) => ({ id: r.id, allow: WRITE })),
    ...builderRoles.map((r) => (builderCanWrite
      ? { id: r.id, allow: WRITE }
      : { id: r.id, allow: READ, deny: PermissionFlagsBits.SendMessages })),
    { id: botUserId, allow: WRITE },
  ];
}

const CHANNELS = [
  {
    key: 'channel_staff_announcements',
    name: 'staff-announcements',
    topic: 'News for the build team. Managers post, builders read.',
    builderCanWrite: false,
    intro: '📣 **Staff announcements** — news for the build team. Managers post here, builders read. Clients never see this channel.',
  },
  {
    key: 'channel_staff_chat',
    name: 'staff-chat',
    topic: 'Managers and builders talk here.',
    builderCanWrite: true,
    intro: '💬 **Staff chat** — managers and builders talk here. Clients never see this channel.',
  },
];

/**
 * Create the staff category and channels, or re-apply permissions to the ones made before.
 * Slow (several Discord requests): call after deferReply.
 * @param {import('discord.js').Guild} guild
 * @param {string} botUserId
 * @returns {Promise<{ channels: import('discord.js').TextChannel[], created: number } | null>} null if a role is missing
 */
export async function ensureStaffChannels(guild, botUserId) {
  const managerRoles = getManagerRoles(guild);
  // A role that is also a manager role already has full access through the manager overwrite.
  const builderRoles = getBuilderOnlyRoles(guild);
  if (!managerRoles.length || !builderRoles.length) return null;

  const savedCategory = getSetting(guild.id, 'category_staff');
  let category = savedCategory ? await guild.channels.fetch(savedCategory).catch(() => null) : null;
  const categoryOverwrites = overwrites(guild, botUserId, managerRoles, builderRoles, true);
  if (category) {
    await category.permissionOverwrites.set(categoryOverwrites);
  } else {
    category = await guild.channels.create({ name: 'Staff', type: ChannelType.GuildCategory, permissionOverwrites: categoryOverwrites });
    setSetting(guild.id, 'category_staff', category.id);
  }

  const channels = [];
  let created = 0;
  for (const spec of CHANNELS) {
    const perms = overwrites(guild, botUserId, managerRoles, builderRoles, spec.builderCanWrite);
    const savedId = getSetting(guild.id, spec.key);
    let channel = savedId ? await guild.channels.fetch(savedId).catch(() => null) : null;
    if (channel) {
      await channel.permissionOverwrites.set(perms);
    } else {
      channel = await guild.channels.create({
        name: spec.name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: spec.topic,
        permissionOverwrites: perms,
      });
      setSetting(guild.id, spec.key, channel.id);
      await channel.send(spec.intro);
      created++;
    }
    channels.push(channel);
  }
  return { channels, created };
}
