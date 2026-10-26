/**
 * Handler for confirm_ticket:type — create the private ticket channel.
 * Orders open the order modal instead; the ticket is created on its submit (OrderFlow.js).
 */

import { MessageFlags } from 'discord.js';
import { openTicketChannel, ticketCategoryId, NOT_CONFIGURED_TEXT } from '../../modules/tickets/openTicket.js';
import { showNewOrderModal } from '../../modules/tickets/flows/OrderFlow.js';
import { tryConsumeTicketCreate } from '../../utils/rateLimit.js';
import { replyError } from '../../utils/replies.js';
import { logger } from '../../utils/logger.js';
import { TICKET_TYPES } from '../../constants.js';

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
  // Orders start with the brief: the modal first, the ticket on its submit (OrderFlow.js).
  if (type === TICKET_TYPES.ORDER) {
    await showNewOrderModal(interaction);
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
  if (!ticketCategoryId(guild.id, type)) {
    logger.error('category_active_orders not configured', { guildId: guild.id });
    await interaction.reply({ content: NOT_CONFIGURED_TEXT, flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    // Creating a channel and posting into it can take longer than Discord's 3-second answer window.
    await (fresh ? interaction.deferReply({ flags: MessageFlags.Ephemeral }) : interaction.deferUpdate());
    const user = { id: userId, username: interaction.member?.user?.username || interaction.user.username };
    const { channel } = await openTicketChannel(guild, user, type);

    await interaction.editReply({
      content: `✅ Your ticket is ready: <#${channel.id}>`,
      components: [],
    });
  } catch (err) {
    logger.error('confirmTicket failed', { error: err.message, userId });
    await replyError(interaction, 'Failed to create the ticket. Please try again later.');
  }
}
