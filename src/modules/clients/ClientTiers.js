/**
 * Client tiers: when a manager confirms payment, everyone who is a client of the order — the
 * ticket author and the people added with /invite — gets the order counted, and the role of
 * the highest tier they reached (lower tier roles are taken off).
 *
 *   Client  — 1+ paid orders
 *   Notable — 5+ paid orders and 500+ in total
 *   VIP     — 10+ paid orders and 1000+ in total
 *
 * The total is the number in the accepted quote ("$480" → 480); the currency is not converted.
 * Roles are set with /setup client_roles; a tier without a role is skipped.
 */

import { EmbedBuilder } from 'discord.js';
import { run, get, query } from '../../core/Database.js';
import { getSetting } from '../../core/GuildConfig.js';
import { ticketEvents } from '../tickets/events.js';
import { getTicketById } from '../tickets/TicketRepository.js';
import { STATUS } from '../tickets/TicketStatus.js';
import { logger } from '../../utils/logger.js';

/** Highest first. */
export const TIERS = [
  { key: 'vip', label: 'VIP Client', setting: 'role_vip', orders: 10, total: 1000, perk: null },
  { key: 'notable', label: 'Notable Client', setting: 'role_notable', orders: 5, total: 500, perk: null },
  { key: 'client', label: 'Client', setting: 'role_client', orders: 1, total: 0, perk: '🎁 **5% off your next order**: just mention it when you open your next ticket.' },
];

/**
 * Congratulations card for a new tier role. The role mention shows the role; it does not ping.
 * @param {string} userId
 * @param {object} tier - a TIERS entry
 * @param {string} roleId
 */
export function tierUpPayload(userId, tier, roleId) {
  const lines = [
    `Thank you for trusting us with your build, <@${userId}>! 💚`,
    `You now have the <@&${roleId}> role on this server.`,
  ];
  if (tier.perk) lines.push('', tier.perk);
  const embed = new EmbedBuilder()
    .setColor(0x7ccf00)
    .setTitle(`🎉 Congratulations, you're now a ${tier.label}!`)
    .setDescription(lines.join('\n'));
  return { content: `<@${userId}>`, embeds: [embed], allowedMentions: { users: [userId] } };
}

/**
 * The first number in a price text: "$480" → 480, "€1,200.50" → 1200.5, "450-550" → 450.
 * @param {string | null | undefined} text
 * @returns {number}
 */
export function parseAmount(text) {
  const match = /\d[\d\s,]*(?:\.\d+)?/.exec(text || '');
  if (!match) return 0;
  return Number(match[0].replace(/[\s,]/g, '')) || 0;
}

/**
 * Highest tier these numbers reach, or null.
 * @param {{ orders: number, total: number }} stats
 */
export function tierFor({ orders, total }) {
  return TIERS.find((t) => orders >= t.orders && total >= t.total) ?? null;
}

/** People a manager added to a ticket with /invite. */
export function addTicketMember(ticketId, userId, addedBy) {
  run('INSERT OR IGNORE INTO ticket_members (ticket_id, user_id, added_by) VALUES (?, ?, ?)', [ticketId, userId, addedBy]);
}

/**
 * Clients of an order: the author plus invited people, minus the builder.
 * @param {object} ticket
 * @returns {string[]}
 */
export function orderClients(ticket) {
  const invited = query('SELECT user_id FROM ticket_members WHERE ticket_id = ?', [ticket.id]).map((r) => r.user_id);
  return [...new Set([ticket.client_id, ...invited])].filter((id) => id && id !== ticket.assigned_freelancer_id);
}

/** Paid orders and their total for one person on one server. */
export function clientStats(guildId, userId) {
  const row = get('SELECT COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS total FROM client_payments WHERE guild_id IS ? AND user_id = ?', [guildId, userId]);
  return { orders: row?.orders ?? 0, total: row?.total ?? 0 };
}

/**
 * Count a paid order for each of its clients (once per order and person).
 * @param {object} ticket
 * @returns {string[]} the clients counted
 */
export function recordPaidOrder(ticket) {
  const accepted = get("SELECT price FROM proposals WHERE ticket_id = ? AND status = 'accepted' ORDER BY created_at DESC LIMIT 1", [ticket.id]);
  const amount = parseAmount(accepted?.price);
  const clients = orderClients(ticket);
  for (const userId of clients) {
    run('INSERT OR IGNORE INTO client_payments (guild_id, user_id, ticket_id, amount) VALUES (?, ?, ?, ?)', [ticket.guild_id, userId, ticket.id, amount]);
  }
  return clients;
}

/**
 * Give a member the role of their tier and take the other tier roles off.
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<object | null>} the tier given now (null if nothing changed)
 */
export async function applyTierRole(member) {
  const guildId = member.guild.id;
  const configured = TIERS.filter((t) => getSetting(guildId, t.setting));
  if (!configured.length) return null;
  const tier = tierFor(clientStats(guildId, member.id));
  const target = tier && configured.find((t) => TIERS.indexOf(t) >= TIERS.indexOf(tier));
  const targetRoleId = target ? getSetting(guildId, target.setting) : null;
  for (const t of configured) {
    const roleId = getSetting(guildId, t.setting);
    if (roleId !== targetRoleId && member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Client tier changed');
    }
  }
  if (!targetRoleId || member.roles.cache.has(targetRoleId)) return null;
  await member.roles.add(targetRoleId, `Client tier: ${target.label}`);
  return target;
}

/**
 * On payment confirmed: count the order and update roles. Returns an unsubscribe function (tests).
 * @param {import('discord.js').Client} client
 */
export function attachClientTiers(client) {
  const onStatus = ({ ticketId, type, to }) => {
    if (type !== 'order' || to !== STATUS.PAID) return;
    updateClientTiers(client, ticketId).catch((err) => logger.warn('Client tiers failed', { ticketId, error: err.message }));
  };
  ticketEvents.on('status', onStatus);
  return () => ticketEvents.off('status', onStatus);
}

/** @returns {Promise<void>} */
export async function updateClientTiers(client, ticketId) {
  const ticket = getTicketById(ticketId);
  if (!ticket) return;
  const clients = recordPaidOrder(ticket);
  const channel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
  const guild = channel?.guild;
  if (!guild) return;
  if (!TIERS.some((t) => getSetting(guild.id, t.setting))) {
    // Counted anyway: once roles are set, the next paid order gives the right tier.
    logger.warn('Client tier roles not configured', { guildId: guild.id, ticketId });
    const quoteChannel = ticket.freelancer_channel_id ? await client.channels.fetch(ticket.freelancer_channel_id).catch(() => null) : null;
    await quoteChannel?.send('⚠️ Client roles are not set, so no role was given. Run `/setup client_roles`.').catch(() => {});
    return;
  }
  for (const userId of clients) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    try {
      const given = await applyTierRole(member);
      if (given) await channel.send(tierUpPayload(userId, given, getSetting(guild.id, given.setting)));
    } catch (err) {
      logger.warn('Client tier role failed — is the bot role above the tier roles?', { ticketId, userId, error: err.message });
    }
  }
}
