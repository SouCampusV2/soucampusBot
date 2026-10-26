/**
 * Handler for confirm_ticket:type — create private channel and ticket in DB.
 */

import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { getTicketChannelName } from '../../utils/channelNaming.js';
import { getManagerRole } from '../../utils/permissions.js';
import { getSetting } from '../../core/GuildConfig.js';
import { createTicket } from '../../modules/tickets/TicketRepository.js';
import { startOrderFlow } from '../../modules/tickets/flows/OrderFlow.js';
import { startApplicationFlow } from '../../modules/tickets/flows/ApplicationFlow.js';
import { closeTicketButtonRow } from '../../embeds/templates.js';
import { tryConsumeTicketCreate } from '../../utils/rateLimit.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';
import { TICKET_TYPES } from '../../constants.js';

const TYPE_LABELS = {
  order: 'Order',
  help: 'Help',
  application: 'Team Application',
};

/**
 * @param {{ fresh?: boolean }} [options] - fresh: answer with a new ephemeral message (panel button)
 *   instead of updating the message the button is on (the confirm step of the old menu).
 */
export async function handleConfirmTicket(interaction, parts, { fresh = false } = {}) {
  const type = parts[1];
  if (!Object.values(TICKET_TYPES).includes(type)) {
    await interaction.reply({ content: 'Missing ticket type.', flags: MessageFlags.Ephemeral });
    return;
  }

  const userId = interaction.user.id;
  if (!tryConsumeTicketCreate(userId)) {
    await interaction.reply({
      content: 'You can create only one ticket per 60 seconds. Please wait.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Each type has its own category; help and applications fall back to the orders category.
  const typeCategory = { help: 'category_help', application: 'category_applications' }[type];
  const categoryId = (typeCategory && getSetting(guild.id, typeCategory)) || getSetting(guild.id, 'category_active_orders');
  if (!categoryId) {
    logger.error('category_active_orders not configured', { guildId: guild.id });
    await interaction.reply({
      content: 'This server is not configured yet. An admin needs to run `/setup active_orders` first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member;
  const displayName = member?.user?.username || interaction.user.username || 'user';
  const channelName = getTicketChannelName(type, displayName);

  try {
    // Creating a channel and posting into it can take longer than Discord's 3-second answer window.
    await (fresh ? interaction.deferReply({ flags: MessageFlags.Ephemeral }) : interaction.deferUpdate());
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
    await channel.send({
      content: `Your **${label}** ticket has been created. Ticket ID: \`${ticketId}\`. You can describe your request here.`,
      components: [closeTicketButtonRow(ticketId)],
    });

    // Order and application tickets continue with their form; help is a plain conversation.
    if (type === TICKET_TYPES.ORDER) await startOrderFlow(channel, ticketId);
    if (type === TICKET_TYPES.APPLICATION) await startApplicationFlow(channel, ticketId);

    await interaction.editReply({
      content: `Ticket created: <#${channel.id}>`,
      components: [],
    });
  } catch (err) {
    logger.error('confirmTicket failed', { error: err.message, userId });
    await replyError(interaction, 'Failed to create the ticket. Please try again later.');
  }
}