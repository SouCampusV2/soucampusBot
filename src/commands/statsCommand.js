/**
 * Slash command /stats [days] — the numbers for this server: funnel, prices, reviews, team applications.
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { computeStats } from '../modules/tickets/Reports.js';
import { isManagerOrAdmin } from '../utils/permissions.js';
import { statsEmbed } from '../embeds/templates.js';

const DEFAULT_DAYS = 30;

export const statsCommandData = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Orders, conversion, prices and reviews on this server (manager only)')
  .setDMPermission(false)
  .addIntegerOption((o) =>
    o.setName('days').setDescription(`Look back this many days (default ${DEFAULT_DAYS})`).setMinValue(1).setMaxValue(3650)
  )
  .toJSON();

export async function handleStatsCommand(interaction) {
  if (!interaction.guildId || !isManagerOrAdmin(interaction.member)) {
    await interaction.reply({ content: 'Only a manager can see the stats.', flags: MessageFlags.Ephemeral });
    return;
  }
  const days = interaction.options.getInteger('days') ?? DEFAULT_DAYS;
  const stats = computeStats(interaction.guildId, Date.now() - days * 86_400_000);
  await interaction.reply({ embeds: [statsEmbed(stats, days, interaction.guildId)], flags: MessageFlags.Ephemeral });
}
