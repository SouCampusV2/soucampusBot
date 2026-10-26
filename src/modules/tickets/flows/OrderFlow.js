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
  setQuoteChannelDueAt,
  getPendingQuoteChannelTickets,
} from '../TicketRepository.js';
import { getSetting } from '../../../core/GuildConfig.js';
import { STATUS, transitionTicket } from '../TicketStatus.js';
import {
  orderBudgetSelectRow,
  getOrderSummaryPayload,
  startOrderButtonRow,
  buildOrderForm1Modal,
  buildOrderForm2Modal,
  orderForm2ButtonRow,
  missingOrderFields,
  orderSummaryEmbedForFreelancers,
  freelancerActionButtonRows,
  EDIT_ORDER_MODAL_FIELDS,
  ORDER_FORM_2_FIELDS,
  deadlineWarning,
} from '../../../embeds/templates.js';
import { ORDER_QUESTION_KEYS } from '../../../constants.js';
import { getQuoteChannelName } from '../../../utils/channelNaming.js';
import { getManagerRole, getFreelancerRole, ensureTicketClient } from '../../../utils/permissions.js';
import { replyError } from '../../../utils/replies.js';
import { logger } from '../../../utils/logger.js';
import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';

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
 * The form is complete once the ticket left the FORM stage (budget picked → OPEN).
 * Replaces counting rows in ticket_fields, which broke as soon as a field was added or left empty.
 * @param {string} ticketId
 * @returns {boolean}
 */
export function isFormComplete(ticketId) {
  return getTicketById(ticketId)?.status !== STATUS.FORM;
}

/**
 * Handle "Fill order form" button: show Modal 1 (5 fields). If form already complete (step >= 8), do not show modal.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string[]} parts - [ 'start_order', ticketId ]
 */
export async function handleStartOrder(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await ensureTicketClient(interaction, getTicketById(ticketId)))) return;
  if (isFormComplete(ticketId)) {
    await interaction.reply({ content: 'Order form is already complete.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await ensureTicketClient(interaction, getTicketById(ticketId)))) return;
  if (isFormComplete(ticketId)) {
    await interaction.reply({ content: 'Order form is already complete.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    let warning = '';
    for (const key of EDIT_ORDER_MODAL_FIELDS) {
      const value = interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '';
      saveTicketField(ticketId, key, value);
      if (key === 'deadline') warning = deadlineWarning(value, updateTicketDeadline(ticketId, value));
    }
    await interaction.reply({
      content: 'Part 1 saved. Click below to fill version and extra details.' + warning,
      components: [orderForm2ButtonRow(ticketId)],
    });
  } catch (err) {
    logger.error('Order form 1 modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to save.');
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
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await ensureTicketClient(interaction, getTicketById(ticketId)))) return;
  if (isFormComplete(ticketId)) {
    await interaction.reply({ content: 'Order form is already complete.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await ensureTicketClient(interaction, getTicketById(ticketId)))) return;
  if (isFormComplete(ticketId)) {
    await interaction.reply({ content: 'Order form is already complete.', flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: 'Part 2 saved. Choose your budget below.', flags: MessageFlags.Ephemeral });
    if (channel) {
      await channel.send({
        content: 'What is your budget?',
        components: [orderBudgetSelectRow(ticketId)],
      });
    }
  } catch (err) {
    logger.error('Order form 2 modal failed', { ticketId, error: err.message });
    await replyError(interaction, 'Failed to save.');
  }
}

/**
 * Handle budget select (step 8): save budget, show the summary with Edit Order + Submit order.
 * The order stays in the FORM stage — freelancers see nothing until the client submits.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 * @param {string[]} parts - [ 'order_budget', ticketId ]
 */
export async function handleOrderBudgetSelect(interaction, parts) {
  const ticketId = parts[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketById(ticketId);
  if (!(await ensureTicketClient(interaction, ticket))) return;
  if (ticket.status !== STATUS.FORM) {
    await interaction.reply({ content: 'This order is already submitted.', flags: MessageFlags.Ephemeral });
    return;
  }
  const value = interaction.values?.[0] || '';
  if (!value) {
    await interaction.reply({ content: 'Please select a budget.', flags: MessageFlags.Ephemeral });
    return;
  }
  saveTicketField(ticketId, ORDER_QUESTION_KEYS[7], value);
  await interaction.update(getOrderSummaryPayload(getTicketFields(ticketId), ticketId, { submitted: false }));
  logger.info('Order summary shown, waiting for submit', { ticketId });
}

/**
 * Handle Submit order (STEP 3 → 4): check required answers, form → open, quote channel now.
 * Replaces the old "quote channel 60 seconds after the summary" timer: the client decides when
 * the order is ready (owner's decision 2026-10-27).
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string[]} parts - [ 'submit_order', ticketId ]
 */
export async function handleSubmitOrder(interaction, parts) {
  const ticketId = parts[1];
  const ticket = ticketId ? getTicketById(ticketId) : undefined;
  if (!(await ensureTicketClient(interaction, ticket))) return;
  const fields = getTicketFields(ticketId);
  const missing = missingOrderFields(fields);
  if (missing.length) {
    await interaction.reply({
      content: `Please fill in before submitting: **${missing.join('**, **')}** — use **Edit Order** (or **Fill order form**).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // The transition is the gate: a double click finds the order already open.
  if (!transitionTicket(ticketId, STATUS.OPEN)) {
    await interaction.reply({ content: 'This order is already submitted.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await interaction.update(getOrderSummaryPayload(fields, ticketId, { submitted: true }));
    await createQuoteChannelForTicket(interaction.client, ticketId);
    logger.info('Order submitted', { ticketId });
  } catch (err) {
    logger.error('submit_order failed', { ticketId, error: err.message });
    await replyError(interaction, 'Your order is submitted, but opening it to freelancers failed — a manager will check.');
  }
}

/**
 * Legacy: orders from before Submit order (≤ 2026-10-27) had a 60-second timer stored in
 * quote_channel_due_at. On startup, finish any that were still pending. New orders never set it.
 * On startup, re-arm any pending quote-channel timers that were lost on the last shutdown.
 * Overdue tickets are created immediately; others are rescheduled for their remaining time.
 * @param {import('discord.js').Client} client
 */
export function recoverPendingQuoteChannels(client) {
  let pending;
  try {
    pending = getPendingQuoteChannelTickets();
  } catch (err) {
    logger.error('recoverPendingQuoteChannels query failed', { error: err.message });
    return;
  }
  for (const ticket of pending) {
    const remaining = (ticket.quote_channel_due_at ?? 0) - Date.now();
    if (remaining <= 0) {
      createQuoteChannelForTicket(client, ticket.id);
    } else {
      setTimeout(() => createQuoteChannelForTicket(client, ticket.id), remaining).unref();
    }
  }
  if (pending.length) logger.info('Recovered pending quote-channel timers', { count: pending.length });
}

/**
 * Create quote channel in QUOTES category; post the order embed (with the client) and 3 buttons.
 * @param {import('discord.js').Client} client
 * @param {string} ticketId
 */
export async function createQuoteChannelForTicket(client, ticketId) {
  try {
    const ticket = getTicketById(ticketId);
    if (!ticket || ticket.freelancer_channel_id) return;
    const clientChannel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (!clientChannel?.guild) return;
    const guild = clientChannel.guild;
    const categoryId = getSetting(guild.id, 'category_quotes');
    if (!categoryId) {
      logger.warn('category_quotes not configured — quote channel not created', { guildId: guild.id });
      return;
    }
    let clientName = 'client';
    const member = await guild.members.fetch(ticket.client_id).catch(() => null);
    if (member) clientName = member.displayName || member.user.username || clientName;
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
    setQuoteChannelDueAt(ticketId, null); // timer fulfilled — clear so recovery skips it
    const fields = getTicketFields(ticketId);
    await channel.send({
      embeds: [orderSummaryEmbedForFreelancers(fields, ticket.client_id)],
      components: freelancerActionButtonRows(ticketId),
    });
    logger.info('Quote channel created', { ticketId, channelId: channel.id });
  } catch (err) {
    logger.error('createQuoteChannelForTicket failed', { ticketId, error: err.message });
  }
}
