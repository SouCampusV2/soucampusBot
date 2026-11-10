/**
 * Order flow (STEPS 2–4): the brief is filled BEFORE the ticket exists, like the commission
 * forms of other studios (owner's decision 2026-10-26).
 *
 *   Panel "Start my project" → order modal (what, size, style, budget & timeframe, files)
 *   → its submit creates the ticket: welcome card, the reference files, the summary card
 *   → summary card: Version & deadline (modal) · Edit order (the order modal again) · Submit order
 *   → Submit: form → open, quote channel with the brief and the files.
 *
 * The summary card is ONE message edited in place: every modal opened from its buttons answers
 * with interaction.update().
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
import { refreshOrderCard } from '../OrderCard.js';
import { openTicketChannel, ticketCategoryId, NOT_CONFIGURED_TEXT } from '../openTicket.js';
import {
  getOrderSummaryPayload,
  buildOrderModal,
  buildOrderFinishModal,
  missingOrderFields,
  orderBriefPayload,
  referencesCaption,
  deadlineWarning,
  EDIT_CLOSED_TEXT,
} from '../../../embeds/templates.js';
import { TICKET_TYPES, REFERENCE_MESSAGES_FIELD } from '../../../constants.js';
import { getQuoteChannelName } from '../../../utils/channelNaming.js';
import { getManagerRoles, getBuilderRoles, ensureTicketClient } from '../../../utils/permissions.js';
import { tryConsumeTicketCreate, isTicketCreateLimited } from '../../../utils/rateLimit.js';
import { replyError } from '../../../utils/replies.js';
import { logger } from '../../../utils/logger.js';
import { pingStaff } from '../../../utils/notify.js';
import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/** Text answers of the order modal and of the Version & deadline modal. */
const ORDER_MODAL_FIELDS = ['need', 'size', 'theme', 'budget'];
const FINISH_MODAL_FIELDS = ['deadline', 'extra_details'];

/** The client may change the brief before submitting and while quotes come in — not once a freelancer took it. */
const EDITABLE = [STATUS.FORM, STATUS.OPEN];

const RATE_LIMIT_TEXT = 'You can create only one ticket per 60 seconds. Please wait a moment and try again.';

/** Reference files uploaded in the order modal (none when the client skipped the upload). */
function uploadedReferences(interaction) {
  return [...(interaction.fields.getUploadedFiles('field_references')?.values() ?? [])];
}

/** Save the text answers of the order modal; returns the uploaded files. */
function saveOrderModal(interaction, ticketId) {
  for (const key of ORDER_MODAL_FIELDS) {
    saveTicketField(ticketId, key, interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '');
  }
  return uploadedReferences(interaction);
}

/**
 * Post files as attachments of a new message. Modal uploads live on temporary links, so the
 * bot re-uploads them — the message is the lasting copy.
 * @returns {Promise<import('discord.js').Message | null>} null when nothing was posted
 */
async function postReferences(channel, files, caption) {
  if (!files.length) return null;
  try {
    return await channel.send({
      content: caption,
      files: files.map((f) => ({ attachment: f.url, name: f.name })),
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    logger.warn('Reference files could not be posted', { channelId: channel.id, count: files.length, error: err.message });
    await channel
      .send(`⚠️ ${files.length} reference file(s) could not be attached (too large?). Please drop them into this chat.`)
      .catch((e) => logger.debug('Reference fallback notice failed', { error: e.message }));
    return null;
  }
}

/** Post the client's files in their channel and remember the message, so Submit can forward them. */
async function attachReferences(channel, ticket, files) {
  const message = await postReferences(channel, files, referencesCaption(ticket.client_id));
  if (!message) return;
  const known = getTicketFields(ticket.id).find((f) => f.field_name === REFERENCE_MESSAGES_FIELD)?.field_value;
  saveTicketField(ticket.id, REFERENCE_MESSAGES_FIELD, known ? `${known},${message.id}` : message.id);
}

/** Copy the reference files from the client's channel into the quote channel (fresh links on fetch). */
async function forwardReferences(fromChannel, toChannel, ticketId) {
  const ids = getTicketFields(ticketId).find((f) => f.field_name === REFERENCE_MESSAGES_FIELD)?.field_value;
  if (!ids) return;
  const files = [];
  for (const id of ids.split(',')) {
    const message = await fromChannel.messages.fetch(id).catch(() => null);
    files.push(...(message?.attachments?.values() ?? []));
  }
  await postReferences(toChannel, files, referencesCaption(null, { forFreelancers: true }));
}

/**
 * Post a fresh summary card in the ticket channel.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} ticketId
 */
export async function postOrderSummary(channel, ticketId) {
  await channel.send(getOrderSummaryPayload(getTicketById(ticketId), getTicketFields(ticketId)));
}

/**
 * Answer a modal opened from the summary card by redrawing the card in place.
 * A button on a message of the old form (classic, not V2) may refuse the edit — then a new
 * card is posted instead.
 */
async function showSummary(interaction, ticketId) {
  const ticket = getTicketById(ticketId);
  const payload = getOrderSummaryPayload(ticket, getTicketFields(ticketId));
  try {
    await interaction.update(payload);
  } catch (err) {
    logger.info('Summary not editable in place, posting a new one', { ticketId, error: err.message });
    await interaction.reply(ephemeral('✅ Saved.'));
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    await channel?.send(payload);
  }
}

/** After an edit of a submitted order: freelancers quote on what they see — show them the new brief. */
async function afterBriefChanged(client, ticketId, files = []) {
  const ticket = getTicketById(ticketId);
  if (ticket.freelancer_channel_id) {
    const quoteChannel = await client.channels.fetch(ticket.freelancer_channel_id).catch(() => null);
    if (quoteChannel) {
      await quoteChannel.send(orderBriefPayload(ticket, getTicketFields(ticketId), { updated: true }));
      await postReferences(quoteChannel, files, referencesCaption(null, { forFreelancers: true }));
    }
  }
  await refreshOrderCard(client, ticketId);
}

/** The order ticket of this interaction, if the clicker is its client and it is still editable; else answers. */
async function editableOrder(interaction, ticketId) {
  const ticket = ticketId ? getTicketById(ticketId) : undefined;
  if (ticket?.type !== TICKET_TYPES.ORDER) {
    await interaction.reply(ephemeral('Order not found.'));
    return null;
  }
  // A modal is its own door: callers re-run this on submit, the check on the button does not carry over.
  if (!(await ensureTicketClient(interaction, ticket))) return null;
  if (!EDITABLE.includes(ticket.status)) {
    await interaction.reply(ephemeral(EDIT_CLOSED_TEXT));
    return null;
  }
  return ticket;
}

/**
 * Panel Order button: open the order modal. Nothing is created yet — the ticket appears when
 * the client submits the brief. Checks that would refuse the submit are done here first, so
 * nobody types a brief just to lose it.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function showNewOrderModal(interaction) {
  if (!interaction.guild) {
    await interaction.reply(ephemeral('This can only be used in a server.'));
    return;
  }
  if (!ticketCategoryId(interaction.guild.id, TICKET_TYPES.ORDER)) {
    await interaction.reply(ephemeral(NOT_CONFIGURED_TEXT));
    return;
  }
  if (isTicketCreateLimited(interaction.user.id)) {
    await interaction.reply(ephemeral(RATE_LIMIT_TEXT));
    return;
  }
  await interaction.showModal(buildOrderModal(null));
}

/**
 * order_new modal submit: create the order ticket with the brief already in it.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleNewOrderModal(interaction) {
  const guild = interaction.guild;
  if (!guild || !ticketCategoryId(guild.id, TICKET_TYPES.ORDER)) {
    await interaction.reply(ephemeral(NOT_CONFIGURED_TEXT));
    return;
  }
  if (!tryConsumeTicketCreate(interaction.user.id)) {
    await interaction.reply(ephemeral(RATE_LIMIT_TEXT));
    return;
  }
  try {
    // Channel + three posts: well over Discord's 3 seconds.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = { id: interaction.user.id, username: interaction.member?.user?.username || interaction.user.username };
    const { channel, ticket } = await openTicketChannel(guild, user, TICKET_TYPES.ORDER);
    const files = saveOrderModal(interaction, ticket.id);
    await attachReferences(channel, ticket, files);
    await postOrderSummary(channel, ticket.id);
    await interaction.editReply({
      content: `✅ Your order ticket is ready: <#${channel.id}>\nOne last step there: the Minecraft version and deadline, then **Submit order**.`,
    });
    logger.info('Order ticket created from the order modal', { ticketId: ticket.id, files: files.length });
  } catch (err) {
    logger.error('order_new failed', { userId: interaction.user.id, error: err.message });
    await replyError(interaction, 'Failed to create the ticket. Please try again later.');
  }
}

/**
 * edit_order_modal:ticketId — the order modal from Edit order: save, add files, redraw the card.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {string[]} parts - [ 'edit_order_modal', ticketId ]
 */
export async function handleEditOrderModal(interaction, parts) {
  const ticket = await editableOrder(interaction, parts[1]);
  if (!ticket) return;
  try {
    const files = saveOrderModal(interaction, ticket.id);
    await showSummary(interaction, ticket.id);
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (channel) await attachReferences(channel, ticket, files);
    if (ticket.status !== STATUS.FORM) await afterBriefChanged(interaction.client, ticket.id, files);
    logger.info('Order edited', { ticketId: ticket.id });
  } catch (err) {
    logger.error('Edit order modal failed', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'Failed to update the order.');
  }
}

/**
 * order_finish:ticketId (and the old order_form_2) — open Version & deadline.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string[]} parts - [ 'order_finish', ticketId ]
 */
export async function handleOrderFinish(interaction, parts) {
  const ticket = await editableOrder(interaction, parts[1]);
  if (!ticket) return;
  await interaction.showModal(buildOrderFinishModal(ticket.id, getTicketFields(ticket.id)));
}

/**
 * order_finish_modal:ticketId — save version, deadline, extra details; redraw the card.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {string[]} parts - [ 'order_finish_modal', ticketId ]
 */
export async function handleOrderFinishModal(interaction, parts) {
  const ticket = await editableOrder(interaction, parts[1]);
  if (!ticket) return;
  try {
    saveTicketField(ticket.id, 'version', interaction.fields.getStringSelectValues('field_version')[0] ?? '');
    for (const key of FINISH_MODAL_FIELDS) {
      saveTicketField(ticket.id, key, interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '');
    }
    const deadline = getTicketFields(ticket.id).find((f) => f.field_name === 'deadline')?.field_value ?? '';
    const warning = deadlineWarning(deadline, updateTicketDeadline(ticket.id, deadline));
    await showSummary(interaction, ticket.id);
    if (warning) await interaction.followUp(ephemeral(warning.trim()));
    if (ticket.status !== STATUS.FORM) await afterBriefChanged(interaction.client, ticket.id);
  } catch (err) {
    logger.error('order_finish_modal failed', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'Failed to save.');
  }
}

/**
 * Handle Submit order (STEP 3 → 4): check required answers, form → open, quote channel now.
 * The client decides when the order is ready (owner's decision 2026-10-27).
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string[]} parts - [ 'submit_order', ticketId ]
 */
export async function handleSubmitOrder(interaction, parts) {
  const ticketId = parts[1];
  const ticket = ticketId ? getTicketById(ticketId) : undefined;
  if (!(await ensureTicketClient(interaction, ticket))) return;
  const missing = missingOrderFields(getTicketFields(ticketId));
  if (missing.length) {
    await interaction.reply(
      ephemeral(`Please fill in before submitting: **${missing.join('**, **')}** — use **Version & deadline** or **Edit order**.`)
    );
    return;
  }
  // The transition is the gate: a double click finds the order already open.
  if (!transitionTicket(ticketId, STATUS.OPEN)) {
    await interaction.reply(ephemeral('This order is already submitted.'));
    return;
  }
  try {
    await interaction.update(getOrderSummaryPayload(getTicketById(ticketId), getTicketFields(ticketId)));
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
 * Create quote channel in QUOTES category; post the brief (with the client), its buttons and
 * the reference files.
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
    // Visibility: every builder role and every manager role (one overwrite per role).
    const staffRoleIds = new Set([...getBuilderRoles(guild), ...getManagerRoles(guild)].map((r) => r.id));
    const overwrites = [{ id: guild.id, deny: PermissionFlagsBits.ViewChannel }];
    for (const id of staffRoleIds) overwrites.push({ id, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages });
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: overwrites,
    });
    setFreelancerChannelId(ticketId, channel.id);
    setQuoteChannelDueAt(ticketId, null); // timer fulfilled — clear so recovery skips it
    await channel.send(orderBriefPayload(ticket, getTicketFields(ticketId)));
    await forwardReferences(clientChannel, channel, ticketId);
    await pingStaff(channel, 'a new order is open for quotes.');
    logger.info('Quote channel created', { ticketId, channelId: channel.id });
  } catch (err) {
    logger.error('createQuoteChannelForTicket failed', { ticketId, error: err.message });
  }
}
