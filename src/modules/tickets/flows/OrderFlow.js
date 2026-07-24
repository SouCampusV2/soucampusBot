/**
 * Order dialog flow (STEP 2): modal-based form, then budget select, then summary.
 * Flow: "Fill order form" button → Modal 1 (5 fields) → "Continue" → Modal 2 (version, extra_details) → Budget select → Summary + Edit Order.
 */

import {
  getTicketById,
  getTicketFields,
  saveTicketField,
  updateTicketDeadline,
  setFreelancerChannelId,
} from '../TicketRepository.js';
import {
  orderBudgetSelectRow,
  getOrderSummaryPayload,
  startOrderButtonRow,
  buildOrderForm1Modal,
  buildOrderForm2Modal,
  orderForm2ButtonRow,
  orderSummaryEmbedForFreelancers,
  freelancerActionButtonRows,
  EDIT_ORDER_MODAL_FIELDS,
  ORDER_FORM_2_FIELDS,
} from '../../../embeds/templates.js';
import { ORDER_QUESTION_KEYS } from '../../../constants.js';
import { getQuoteChannelName } from '../../../utils/channelNaming.js';
import { getManagerRole, getFreelancerRole } from '../../../utils/permissions.js';
import { logger } from '../../../utils/logger.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

/**
 * Start order dialog: send message with "Fill order form" button (opens modal like Edit Order).
 * Call this from confirmTicket when type === 'order'.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} ticketId
 */
export async function startOrderFlow(channel, ticketId) {
  try {
    await channel.send({
      content: 'Click the button below to fill the order form (same style as Edit Order).',
      components: [startOrderButtonRow(ticketId)],
    });
  } catch (err) {
    logger.error('OrderFlow startOrderFlow failed', { ticketId, error: err.message });
    throw err;
  }
}

/**
 * Get current step from number of saved fields. 0 = no fields, 8 = all done.
 * @param {string} ticketId
 * @returns {number}
 */
export function getCurrentStep(ticketId) {
  return getTicketFields(ticketId).length;
}

/**
 * Handle "Fill order form" button: show Modal 1 (5 fields). If form already complete (step >= 8), do not show modal.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string[]} parts - [ 'start_order', ticketId ]
 */
export async function handleStartOrder(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  if (getCurrentStep(ticketId) >= 8) {
    await interaction.reply({ content: 'Order form is already complete.', ephemeral: true });
    return;
  }
  const fields = getTicketFields(ticketId);
  const modal = buildOrderForm1Modal(ticketId, fields);
  await interaction.showModal(modal);
}

/**
 * Handle Order form part 1 modal submit: save 5 fields, send "Continue" button for part 2.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {string[]} parts - [ 'order_form_1', ticketId ]
 */
export async function handleOrderForm1Modal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  if (getCurrentStep(ticketId) >= 8) {
    await interaction.reply({ content: 'Order form is already complete.', ephemeral: true });
    return;
  }
  try {
    for (const key of EDIT_ORDER_MODAL_FIELDS) {
      const value = interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '';
      saveTicketField(ticketId, key, value);
      if (key === 'deadline') updateTicketDeadline(ticketId, value);
    }
    await interaction.reply({
      content: 'Part 1 saved. Click below to fill version and extra details.',
      components: [orderForm2ButtonRow(ticketId)],
    });
  } catch (err) {
    logger.error('Order form 1 modal failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Failed to save.', ephemeral: true }).catch(() => {});
  }
}

/**
 * Handle "Continue" button: show Modal 2 (version, extra_details). If form already complete (step >= 8), do not show modal.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string[]} parts - [ 'order_form_2', ticketId ]
 */
export async function handleOrderForm2(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  if (getCurrentStep(ticketId) >= 8) {
    await interaction.reply({ content: 'Order form is already complete.', ephemeral: true });
    return;
  }
  const fields = getTicketFields(ticketId);
  const modal = buildOrderForm2Modal(ticketId, fields);
  await interaction.showModal(modal);
}

/**
 * Handle Order form part 2 modal submit: save version + extra_details, send budget select in channel.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {string[]} parts - [ 'order_form_2_modal', ticketId ]
 */
export async function handleOrderForm2Modal(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  if (getCurrentStep(ticketId) >= 8) {
    await interaction.reply({ content: 'Order form is already complete.', ephemeral: true });
    return;
  }
  try {
    for (const key of ORDER_FORM_2_FIELDS) {
      const value = interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '';
      saveTicketField(ticketId, key, value);
    }
    const ticket = getTicketById(ticketId);
    const channel = ticket?.client_channel_id
      ? await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null)
      : null;
    await interaction.reply({ content: 'Part 2 saved. Choose your budget below.', ephemeral: true });
    if (channel) {
      await channel.send({
        content: 'What is your budget?',
        components: [orderBudgetSelectRow(ticketId)],
      });
    }
  } catch (err) {
    logger.error('Order form 2 modal failed', { ticketId, error: err.message });
    await interaction.reply({ content: 'Failed to save.', ephemeral: true }).catch(() => {});
  }
}

/**
 * Handle a message in an order ticket channel. Modal flow: only hint if form not complete.
 * When form is complete (step >= 8), do NOT reply to random messages — avoids spam "Order form is complete".
 * @param {import('discord.js').Message} message
 * @param {object} ticket
 */
export async function handleOrderChannelMessage(message, ticket) {
  const ticketId = ticket.id;
  const step = getCurrentStep(ticketId);
  if (step === 0) {
    await message.reply('Click **«Fill order form»** above to start.').catch(() => {});
    return;
  }
  if (step >= 1 && step < 8) {
    await message.reply('Use the form buttons above to continue.').catch(() => {});
    return;
  }
  // step >= 8: form complete — do not reply to random messages (no "Order form is complete" spam)
}

/**
 * Handle budget select (step 8): save budget, show order summary + Edit Order button.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {string[]} parts - [ 'order_budget', ticketId ]
 */
export async function handleOrderBudgetSelect(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
    return;
  }
  const value = interaction.values?.[0] || '';
  if (!value) {
    await interaction.reply({ content: 'Please select a budget.', ephemeral: true });
    return;
  }
  saveTicketField(ticketId, ORDER_QUESTION_KEYS[7], value);
  const fields = getTicketFields(ticketId);
  await interaction.update(getOrderSummaryPayload(fields, ticketId));
  logger.info('Order dialog completed, summary shown', { ticketId });

  // STEP 4: after 60s create freelancer (quote) channel if not already created.
  scheduleQuoteChannelCreation(interaction.client, ticketId);
}

/** Delay before creating quote channel (no edit = proceed). */
const QUOTE_CHANNEL_DELAY_MS = 60_000;

/**
 * Schedule creation of freelancer quote channel 60s after summary (STEP 4).
 * @param {import('discord.js').Client} client
 * @param {string} ticketId
 */
export function scheduleQuoteChannelCreation(client, ticketId) {
  setTimeout(() => createQuoteChannelForTicket(client, ticketId), QUOTE_CHANNEL_DELAY_MS);
}

/**
 * Create quote channel in QUOTES category; post order embed (no client name) and 3 buttons.
 * @param {import('discord.js').Client} client
 * @param {string} ticketId
 */
export async function createQuoteChannelForTicket(client, ticketId) {
  try {
    const ticket = getTicketById(ticketId);
    if (!ticket || ticket.freelancer_channel_id) return;
    const categoryId = process.env.CATEGORY_QUOTES;
    if (!categoryId) {
      logger.warn('CATEGORY_QUOTES not set — quote channel not created');
      return;
    }
    const clientChannel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (!clientChannel?.guild) return;
    const guild = clientChannel.guild;
    let clientName = 'client';
    try {
      const member = await guild.members.fetch(ticket.client_id).catch(() => null);
      if (member) clientName = member.displayName || member.user.username || clientName;
    } catch (_) {}
    const channelName = getQuoteChannelName(clientName);
    // Visibility: Freelancer + Manager (both roles see quote channels)
    const managerRole = getManagerRole(guild);
    const freelancerRole = getFreelancerRole(guild);
    const overwrites = [{ id: guild.id, deny: PermissionFlagsBits.ViewChannel }];
    if (freelancerRole) {
      overwrites.push({ id: freelancerRole.id, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages });
    }
    if (managerRole && managerRole.id !== freelancerRole?.id) {
      overwrites.push({ id: managerRole.id, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages });
    }
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
    });
    setFreelancerChannelId(ticketId, channel.id);
    const fields = getTicketFields(ticketId);
    await channel.send({
      embeds: [orderSummaryEmbedForFreelancers(fields)],
      components: freelancerActionButtonRows(ticketId),
    });
    logger.info('Quote channel created', { ticketId, channelId: channel.id });
  } catch (err) {
    logger.error('createQuoteChannelForTicket failed', { ticketId, error: err.message });
  }
}
