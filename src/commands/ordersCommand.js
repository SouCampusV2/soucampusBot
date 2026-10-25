/**
 * Slash command /orders [status] — manager overview of this server's open tickets, overdue first.
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { listOpenTickets } from '../modules/tickets/Reports.js';
import { isManagerOrAdmin } from '../utils/permissions.js';
import { ordersOverviewEmbed } from '../embeds/templates.js';
import { todayIso } from '../utils/dates.js';

const STATUS_CHOICES = ['form', 'open', 'assigned', 'paid', 'completed'];

export const ordersCommandData = new SlashCommandBuilder()
  .setName('orders')
  .setDescription('Open tickets on this server, overdue first (manager only)')
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName('status')
      .setDescription('Only tickets at this stage')
      .addChoices(...STATUS_CHOICES.map((s) => ({ name: s, value: s })))
  )
  .toJSON();

export async function handleOrdersCommand(interaction) {
  if (!interaction.guildId || !isManagerOrAdmin(interaction.member)) {
    await interaction.reply({ content: 'Only a manager can see the order overview.', flags: MessageFlags.Ephemeral });
    return;
  }
  const status = interaction.options.getString('status');
  const tickets = listOpenTickets(interaction.guildId, todayIso(), status ?? undefined);
  await interaction.reply({ embeds: [ordersOverviewEmbed(tickets, status, interaction.guildId)], flags: MessageFlags.Ephemeral });
}
