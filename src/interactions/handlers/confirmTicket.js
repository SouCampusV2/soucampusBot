/**
 * Handler for confirm_ticket:type — create private channel and ticket in DB.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getOrderChannelName } from '../../utils/channelNaming.js';
import { getManagerRole } from '../../utils/permissions.js';
import { getSetting } from '../../core/GuildConfig.js';
import { createTicket } from '../../modules/tickets/TicketRepository.js';
import { startOrderFlow } from '../../modules/tickets/flows/OrderFlow.js';
import { tryConsumeTicketCreate } from '../../utils/rateLimit.js';
import { logger } from '../../utils/logger.js';
import { TICKET_TYPES } from '../../constants.js';

const TYPE_LABELS = {
  order: 'Order',
  help: 'Help',
  application: 'Team Application',
};

export async function handleConfirmTicket(interaction, parts) {
  const type = parts[1];
  if (!type) {
    await interaction.reply({ content: 'Missing ticket type.', ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  if (!tryConsumeTicketCreate(userId)) {
    await interaction.reply({
      content: 'You can create only one ticket per 60 seconds. Please wait.',
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const categoryId = getSetting(guild.id, 'category_active_orders');
  if (!categoryId) {
    logger.error('category_active_orders not configured', { guildId: guild.id });
    await interaction.reply({
      content: 'This server is not configured yet. An admin needs to run `/setup active_orders` first.',
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member;
  const displayName = member?.user?.username || interaction.user.username || 'user';
  const channelName = getOrderChannelName(displayName);

  try {
    const managerRole = getManagerRole(guild);
    const overwrites = [
      { id: guild.id, deny: PermissionFlagsBits.ViewChannel },
      { id: userId, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages },
    ];
    if (managerRole) {
      overwrites.push({
        id: managerRole.id,
        allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages,
      });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
    });

    const { id: ticketId } = createTicket({
      type,
      guildId: guild.id,
      clientId: userId,
      clientChannelId: channel.id,
    });
    const label = TYPE_LABELS[type] || type;
    await channel.send(
      `Your **${label}** ticket has been created. Ticket ID: \`${ticketId}\`. You can describe your request here.`
    );

    // CHECKPOINT: Order dialog (STEP 2) — only for order type; starts first question.
    if (type === TICKET_TYPES.ORDER) {
      await startOrderFlow(channel, ticketId);
    }

    await interaction.update({
      content: `Ticket created: <#${channel.id}>`,
      components: [],
    });
  } catch (err) {
    logger.error('confirmTicket failed', { error: err.message, userId });
    const msg = interaction.replied || interaction.deferred
      ? { content: 'Failed to create the ticket. Please try again later.', ephemeral: true }
      : { content: 'Failed to create the ticket. Please try again later.', ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    } catch (_) {}
  }
}