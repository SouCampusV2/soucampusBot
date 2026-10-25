/**
 * All embed builders and action components in one place.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { PREFIX, TICKET_TYPES, ORDER_BUDGET_OPTIONS, APPLICATION_FIELDS } from '../constants.js';
import { getSetting } from '../core/GuildConfig.js';
import { estimateOrder, formatEstimate } from '../utils/pricing.js';

const EMBED_COLOR = 0x5865f2; // Discord blurple / brand (default)

/**
 * Resolve the brand color for a guild (from /setup color), falling back to the default.
 * @param {string} [guildId]
 * @returns {number}
 */
function brandColor(guildId) {
  if (!guildId) return EMBED_COLOR;
  const hex = getSetting(guildId, 'brand_color');
  if (!hex) return EMBED_COLOR;
  const parsed = parseInt(hex.replace('#', ''), 16);
  return Number.isFinite(parsed) ? parsed : EMBED_COLOR;
}

/**
 * Ticket panel embed (post in CHANNEL_TICKET_PANEL).
 * @returns {EmbedBuilder}
 */
export function ticketPanelEmbed(guildId) {
  return new EmbedBuilder()
    .setColor(brandColor(guildId))
    .setTitle('Create a ticket')
    .setDescription(
      'Click the button below to open a ticket. Choose **Help**, **Team Application**, or **Order**.'
    )
    .setTimestamp();
}

/**
 * Create Ticket button (customId: create_ticket).
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function createTicketButtonRow() {
  const button = new ButtonBuilder()
    .setCustomId(PREFIX.CREATE_TICKET)
    .setLabel('Create Ticket')
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Select menu: Help / Team Application / Order (customId: select_ticket_type).
 * @returns {ActionRowBuilder<StringSelectMenuBuilder>}
 */
export function selectTicketTypeRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId(PREFIX.SELECT_TICKET_TYPE)
    .setPlaceholder('Choose ticket type')
    .addOptions(
      { label: 'Help', value: TICKET_TYPES.HELP, description: 'Get help from staff' },
      {
        label: 'Team Application',
        value: TICKET_TYPES.APPLICATION,
        description: 'Apply to join the team',
      },
      {
        label: 'Order',
        value: TICKET_TYPES.ORDER,
        description: 'Create a new order',
      }
    );
  return new ActionRowBuilder().addComponents(select);
}

/**
 * Confirm ticket button (customId: confirm_ticket:type).
 * @param {string} type - TICKET_TYPES.ORDER | HELP | APPLICATION
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function confirmTicketButtonRow(type) {
  const label = type === TICKET_TYPES.ORDER ? 'Order' : type === TICKET_TYPES.HELP ? 'Help' : 'Team Application';
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.CONFIRM_TICKET}:${type}`)
    .setLabel(`Confirm — ${label}`)
    .setStyle(ButtonStyle.Success);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Full ticket panel components (embed + button) for posting in channel.
 * @returns {{ embeds: EmbedBuilder[], components: ActionRowBuilder[] }}
 */
export function getTicketPanelPayload(guildId) {
  return {
    embeds: [ticketPanelEmbed(guildId)],
    components: [createTicketButtonRow()],
  };
}

// --- Order dialog (STEP 2 & 3) ---

/** Human-readable labels for order summary embed. */
export const ORDER_FIELD_LABELS = {
  need: 'What are you in need of?',
  deadline: 'When is the deadline?',
  reference_urls: 'Reference images (URLs)',
  size: 'Build size',
  theme: 'Theme',
  version: 'Product version',
  extra_details: 'Extra details',
  budget: 'Budget',
};

/**
 * Budget Select Menu for order dialog step 8 (customId: order_budget:ticketId).
 * @param {string} ticketId
 * @returns {ActionRowBuilder<StringSelectMenuBuilder>}
 */
export function orderBudgetSelectRow(ticketId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX.ORDER_BUDGET}:${ticketId}`)
    .setPlaceholder('Choose your budget range')
    .addOptions(
      ORDER_BUDGET_OPTIONS.map((opt) => ({
        label: opt.label,
        value: opt.value,
      }))
    );
  return new ActionRowBuilder().addComponents(select);
}

/**
 * Order summary embed (STEP 3) — one field per answer.
 * @param {{ field_name: string, field_value: string }[]} fields
 * @returns {EmbedBuilder}
 */
export function orderSummaryEmbed(fields) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Order summary')
    .setDescription('Review your order. Click **Edit Order** to change any field.')
    .setTimestamp();
  addOrderFields(embed, fields);
  return embed;
}

/**
 * One field per answer (budget shown by its label), plus the price estimate when the size is readable.
 * @param {EmbedBuilder} embed
 * @param {{ field_name: string, field_value: string }[]} fields
 */
function addOrderFields(embed, fields) {
  for (const f of fields) {
    const label = ORDER_FIELD_LABELS[f.field_name] || f.field_name;
    const value = f.field_name === 'budget' ? budgetLabel(f.field_value) : f.field_value;
    embed.addFields({ name: label, value: (value || '-').slice(0, 1024), inline: false });
  }
  const estimate = estimateOrder(fields.find((f) => f.field_name === 'size')?.field_value);
  if (estimate) {
    embed.addFields({ name: 'Estimate (guide)', value: `${formatEstimate(estimate)} — the freelancer's quote sets the real price` });
  }
}

/** '100-500' -> '€100–€500' (the stored value stays stable when labels change). */
export function budgetLabel(value) {
  return ORDER_BUDGET_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/**
 * Edit Order button row (customId: edit_order:ticketId). Shown below summary.
 * @param {string} ticketId
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function editOrderButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.EDIT_ORDER}:${ticketId}`)
    .setLabel('Edit Order')
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Full order summary payload: embed + Edit Order button (for posting or interaction.update).
 * @param {{ field_name: string, field_value: string }[]} fields
 * @param {string} ticketId
 */
export function getOrderSummaryPayload(fields, ticketId) {
  return {
    embeds: [orderSummaryEmbed(fields)],
    components: [editOrderButtonRow(ticketId)],
  };
}

/** Refusal when the client tries to edit an order that a freelancer already priced and took. */
export const EDIT_CLOSED_TEXT =
  'This order can no longer be edited — a freelancer has already taken it. Talk to them or a manager about changes.';

/** First 5 order fields shown in Edit modal (Discord limit 5 TextInputs per modal). Rest (version, extra_details, budget) stay as-is on edit. */
export const EDIT_ORDER_MODAL_FIELDS = ['need', 'deadline', 'reference_urls', 'size', 'theme'];

/** Order form part 2: version + extra_details (modal 2). */
export const ORDER_FORM_2_FIELDS = ['version', 'extra_details'];

/**
 * Start order button row (customId: start_order:ticketId). Shown in order channel to open form.
 * @param {string} ticketId
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function startOrderButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.START_ORDER}:${ticketId}`)
    .setLabel('Fill order form')
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Build Order form part 1 modal (5 fields: need, deadline, reference_urls, size, theme). Empty for new order.
 * Modal customId: order_form_1:ticketId
 * @param {string} ticketId
 * @param {{ field_name: string, field_value: string }[]} [fields] - optional prefill (e.g. when resuming)
 * @returns {ModalBuilder}
 */
export function buildOrderForm1Modal(ticketId, fields = []) {
  const valueByKey = Object.fromEntries((fields || []).map((f) => [f.field_name, f.field_value || '']));
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.ORDER_FORM_1}:${ticketId}`)
    .setTitle('Order — Part 1');

  const labels = {
    need: 'What are you in need of?',
    deadline: 'When is the deadline? (e.g. 25.12.2026)',
    reference_urls: 'Reference images (URLs)',
    size: 'Build size',
    theme: 'Theme',
  };
  EDIT_ORDER_MODAL_FIELDS.forEach((key) => {
    const input = new TextInputBuilder()
      .setCustomId(`field_${key}`)
      .setLabel(labels[key] || key)
      .setStyle(key === 'reference_urls' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setValue((valueByKey[key] || '').slice(0, 4000))
      .setRequired(key === 'need');
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });
  return modal;
}

/**
 * Build Order form part 2 modal (version, extra_details). Modal customId: order_form_2_modal:ticketId
 * @param {string} ticketId
 * @param {{ field_name: string, field_value: string }[]} fields - current ticket_fields for prefill
 * @returns {ModalBuilder}
 */
export function buildOrderForm2Modal(ticketId, fields) {
  const valueByKey = Object.fromEntries(fields.map((f) => [f.field_name, f.field_value || '']));
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.ORDER_FORM_2_MODAL}:${ticketId}`)
    .setTitle('Order — Part 2');

  const labels = { version: 'Product version', extra_details: 'Any extra details?' };
  ORDER_FORM_2_FIELDS.forEach((key) => {
    const input = new TextInputBuilder()
      .setCustomId(`field_${key}`)
      .setLabel(labels[key] || key)
      .setStyle(key === 'extra_details' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setValue((valueByKey[key] || '').slice(0, 4000))
      .setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });
  return modal;
}

/**
 * "Continue" button for order form part 2 (customId: order_form_2:ticketId).
 * @param {string} ticketId
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function orderForm2ButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.ORDER_FORM_2}:${ticketId}`)
    .setLabel('Continue — version & details')
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Build Edit Order modal with pre-filled values (STEP 3). Modal customId: edit_order_modal:ticketId.
 * @param {string} ticketId
 * @param {{ field_name: string, field_value: string }[]} fields - current ticket_fields (to get values)
 * @returns {ModalBuilder}
 */
export function buildEditOrderModal(ticketId, fields) {
  const valueByKey = Object.fromEntries(fields.map((f) => [f.field_name, f.field_value || '']));
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.EDIT_ORDER_MODAL}:${ticketId}`)
    .setTitle('Edit Order');

  const labels = {
    need: 'What are you in need of?',
    deadline: 'When is the deadline?',
    reference_urls: 'Reference images (URLs)',
    size: 'Build size',
    theme: 'Theme',
  };
  const rows = EDIT_ORDER_MODAL_FIELDS.map((key) => {
    const input = new TextInputBuilder()
      .setCustomId(`field_${key}`)
      .setLabel(labels[key] || key)
      .setStyle(key === 'reference_urls' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setValue((valueByKey[key] || '').slice(0, 4000))
      .setRequired(key === 'need');
    return new ActionRowBuilder().addComponents(input);
  });
  modal.addComponents(...rows);
  return modal;
}

// --- Freelancer channel (STEP 4) ---

/**
 * Order details embed for freelancer channel (same fields as summary, no client name).
 * @param {{ field_name: string, field_value: string }[]} fields
 * @returns {EmbedBuilder}
 */
export function orderSummaryEmbedForFreelancers(fields) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('Order — request for quote')
    .setDescription('Submit a quote, send a message, or decline.')
    .setTimestamp();
  addOrderFields(embed, fields);
  return embed;
}

/**
 * Three buttons for freelancer channel: Submit Quote, Send Message, Not Interested.
 * @param {string} ticketId
 * @returns {ActionRowBuilder<ButtonBuilder>[]}
 */
export function freelancerActionButtonRows(ticketId) {
  const submitQuote = new ButtonBuilder()
    .setCustomId(`${PREFIX.SUBMIT_QUOTE}:${ticketId}`)
    .setLabel('Submit Quote')
    .setStyle(ButtonStyle.Success);
  const sendMessage = new ButtonBuilder()
    .setCustomId(`${PREFIX.SEND_MESSAGE}:${ticketId}`)
    .setLabel('Send Message')
    .setStyle(ButtonStyle.Primary);
  const notInterested = new ButtonBuilder()
    .setCustomId(`${PREFIX.DECLINE_ORDER}:${ticketId}`)
    .setLabel('Not Interested')
    .setStyle(ButtonStyle.Danger);
  return [new ActionRowBuilder().addComponents(submitQuote, sendMessage, notInterested)];
}

// --- Submit Quote (STEP 5) ---

/**
 * Build Submit Quote modal: Deadline, Price, Short message. Modal customId: submit_quote_modal:ticketId.
 * @param {string} ticketId
 * @returns {ModalBuilder}
 */
export function buildSubmitQuoteModal(ticketId) {
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.SUBMIT_QUOTE_MODAL}:${ticketId}`)
    .setTitle('Submit Quote');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_deadline')
        .setLabel('Your deadline for this order')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 25.12.2026 or in 2 weeks')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_price')
        .setLabel('Your price')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. €150')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quote_message')
        .setLabel('Short message to the client')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Optional')
        .setRequired(false)
    )
  );
  return modal;
}

/**
 * Quote embed (author: freelancer username, price, deadline, message). Shown in freelancer channel and client channel.
 * @param {{ price: string, deadline: string, message: string }} data
 * @param {string} freelancerUsername
 * @returns {EmbedBuilder}
 */
export function quoteEmbed(data, freelancerUsername, stats) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: freelancerUsername })
    .setTitle('Quote');
  if (stats) embed.setDescription(trackRecordText(stats));
  return embed
    .addFields(
      { name: 'Price', value: data.price || '-', inline: true },
      { name: 'Deadline', value: data.deadline || '-', inline: true },
      { name: 'Message', value: (data.message || '-').slice(0, 1024), inline: false }
    )
    .setTimestamp();
}

/**
 * All client quote action buttons (only order creator can use). One row, 5 buttons.
 * Accept | Contact freelancer | Decline: price | portfolio | deadline
 * @param {string} ticketId
 * @param {string} freelancerId
 * @param {string} proposalId
 * @returns {ActionRowBuilder<ButtonBuilder>[]}
 */
export function clientQuoteActionRows(ticketId, freelancerId, proposalId) {
  const accept = new ButtonBuilder()
    .setCustomId(`${PREFIX.SELECT_FREELANCER}:${ticketId}:${freelancerId}`)
    .setLabel('Accept')
    .setStyle(ButtonStyle.Success);
  const contact = new ButtonBuilder()
    .setCustomId(`${PREFIX.CONTACT_FREELANCER}:${ticketId}:${freelancerId}`)
    .setLabel('Contact freelancer')
    .setStyle(ButtonStyle.Primary);
  const declineButtons = Object.entries(DECLINE_REASON_LABELS).map(([reason, label]) =>
    new ButtonBuilder()
      .setCustomId(`${PREFIX.DECLINE_QUOTE}:${ticketId}:${proposalId}:${reason}`)
      .setLabel(`Decline: ${label}`)
      .setStyle(ButtonStyle.Secondary)
  );
  return [new ActionRowBuilder().addComponents(accept, contact, ...declineButtons)];
}

/** Reasons a client can decline a quote with: customId value -> label. */
export const DECLINE_REASON_LABELS = { price: 'price', portfolio: 'portfolio', deadline: 'deadline' };

/**
 * Embed posted in the quote channel when the client declines a quote.
 * @param {{ price?: string, deadline?: string, message?: string }} proposal
 * @param {string} freelancerName
 * @param {string} reasonLabel
 * @returns {EmbedBuilder}
 */
export function quoteDeclinedEmbed(proposal, freelancerName, reasonLabel) {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('Quote declined by the client')
    .setDescription(`The client declined ${freelancerName}'s quote. Reason: **${reasonLabel}**.`)
    .addFields(
      { name: 'Price', value: (proposal.price || '-').slice(0, 1024), inline: true },
      { name: 'Deadline', value: (proposal.deadline || '-').slice(0, 1024), inline: true },
      { name: 'Message / portfolio', value: (proposal.message || '-').slice(0, 1024), inline: false }
    )
    .setTimestamp();
}

// --- Send Message / Reply relay (STEP 6) ---

/**
 * Build Send Message modal (freelancer). One paragraph. customId: send_message_modal:ticketId
 * @param {string} ticketId
 * @returns {ModalBuilder}
 */
export function buildSendMessageModal(ticketId) {
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.SEND_MESSAGE_MODAL}:${ticketId}`)
    .setTitle('Send Message to Client');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('relay_message')
        .setLabel('Your message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type your message...')
        .setRequired(true)
    )
  );
  return modal;
}

/**
 * Relay message embed (thread-style). Author = sender name, description = message.
 * @param {string} authorName - e.g. freelancer display name or "Client"
 * @param {string} content
 * @returns {EmbedBuilder}
 */
export function relayMessageEmbed(authorName, content) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: authorName })
    .setDescription((content || '').slice(0, 4096))
    .setTimestamp();
}

/** Reply button under relay message. customId: reply_relay:ticketId */
export function replyRelayButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.REPLY_RELAY}:${ticketId}`)
    .setLabel('Reply')
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(button);
}

/** "Close discussion" button in discussion thread. customId: close_discussion:ticketId:threadId */
export function closeDiscussionButtonRow(ticketId, threadId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.CLOSE_DISCUSSION}:${ticketId}:${threadId}`)
    .setLabel('Close discussion')
    .setStyle(ButtonStyle.Danger);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Build Reply modal (client or freelancer). customId: reply_relay_modal:ticketId
 * @param {string} ticketId
 * @returns {ModalBuilder}
 */
export function buildReplyRelayModal(ticketId) {
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.REPLY_RELAY_MODAL}:${ticketId}`)
    .setTitle('Reply');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reply_text')
        .setLabel('Your reply')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );
  return modal;
}

// --- Mark Complete & Review (STEP 10) ---

/** "Mark as Complete" button (manager). customId: mark_complete:ticketId */
export function markCompleteButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.MARK_COMPLETE}:${ticketId}`)
    .setLabel('Mark as Complete')
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder().addComponents(button);
}

/** "Leave Review" button (client). customId: submit_review:ticketId */
export function leaveReviewButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.SUBMIT_REVIEW}:${ticketId}`)
    .setLabel('Leave Review')
    .setStyle(ButtonStyle.Success);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Build Submit Review modal. Rating (1-5) + Comment. customId: submit_review_modal:ticketId
 * @param {string} ticketId
 * @returns {ModalBuilder}
 */
export function buildSubmitReviewModal(ticketId) {
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.SUBMIT_REVIEW_MODAL}:${ticketId}`)
    .setTitle('Leave a Review');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('review_rating')
        .setLabel('Rating (1 to 5)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1')
        .setMinLength(1)
        .setMaxLength(1)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('review_comment')
        .setLabel('Comment')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Optional')
        .setRequired(false)
    )
  );
  return modal;
}

/**
 * Review embed for #reviews channel.
 * @param {{ rating: number, comment: string }} data
 * @param {string} clientName
 * @param {string} freelancerName
 * @param {string} ticketId
 * @returns {EmbedBuilder}
 */
export function reviewEmbed(data, clientName, freelancerName, ticketId) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Review — Order ${ticketId}`)
    .addFields(
      { name: 'Rating', value: `${data.rating}/5`, inline: true },
      { name: 'Client', value: clientName, inline: true },
      { name: 'Freelancer', value: freelancerName, inline: true },
      { name: 'Comment', value: (data.comment || '-').slice(0, 1024), inline: false }
    )
    .setTimestamp();
}

/**
 * Warning appended to a form reply when the client's deadline is not a readable date.
 * The form still saves (the text is shown in the summary) — but reminders need a date.
 * @param {string} text - what the client typed
 * @param {string | null} date - parse result
 * @returns {string} '' when there is nothing to warn about
 */
export function deadlineWarning(text, date) {
  if (!text || date) return '';
  return (
    `\n⚠️ We could not read "${text.slice(0, 50)}" as a date, so there will be no deadline reminders. ` +
    'Use e.g. `25.12.2026` or `in 2 weeks` (Edit Order) if you want them.'
  );
}

/**
 * "⭐ 4.5 · 2 reviews · 3 orders delivered" — or "New on this server" instead of a bare 0.
 * @param {{ delivered: number, reviews: number, avgRating: number | null }} stats
 */
export function trackRecordText({ delivered, reviews, avgRating }) {
  if (!delivered && !reviews) return '🆕 New on this server — no delivered orders yet';
  const parts = [];
  if (reviews) parts.push(`⭐ ${avgRating} · ${reviews} ${reviews === 1 ? 'review' : 'reviews'}`);
  parts.push(`${delivered} ${delivered === 1 ? 'order' : 'orders'} delivered`);
  return parts.join(' · ');
}

// --- Order card (one live message per order in the client channel) ---

/** Milestones shown on the card, in order; a milestone is done once the status reaches it. */
const CARD_MILESTONES = [
  ['open', 'Order form'],
  ['assigned', 'Freelancer picked'],
  ['paid', 'Paid'],
  ['completed', 'Delivered'],
];
const CARD_STATUS_TEXT = {
  open: 'Collecting quotes',
  assigned: 'Waiting for payment',
  paid: 'In progress',
  completed: 'Delivered — please leave a review',
  closed: 'Closed',
};

/**
 * @param {{ id: string, status: string, guild_id?: string, assigned_freelancer_id?: string, deadline?: string }} ticket
 * @param {{ field_name: string, field_value: string }[]} fields
 * @param {{ quotes: number, declined: number, agreedPrice?: string }} info
 */
export function orderCardEmbed(ticket, fields, { quotes, declined, agreedPrice }) {
  const order = ['form', ...CARD_MILESTONES.map(([s]) => s)];
  const reached = ticket.status === 'closed' ? -1 : order.indexOf(ticket.status);
  let nextMarked = false;
  const timeline = CARD_MILESTONES.map(([status, label]) => {
    if (order.indexOf(status) <= reached) return `✅ ${label}`;
    if (!nextMarked && ticket.status !== 'closed') {
      nextMarked = true;
      return `▶️ **${label}**`;
    }
    return `⬜ ${label}`;
  }).join('\n');

  const valueOf = (name) => fields.find((f) => f.field_name === name)?.field_value;
  const embed = new EmbedBuilder()
    .setColor(brandColor(ticket.guild_id))
    .setTitle(`Order · ${ticket.id}`)
    .setDescription(`**${CARD_STATUS_TEXT[ticket.status] ?? ticket.status}**\n\n${timeline}`)
    .setTimestamp();
  if (ticket.status === 'open') {
    embed.addFields({ name: 'Quotes', value: `${quotes} received · ${declined} not interested`, inline: true });
  }
  if (ticket.assigned_freelancer_id) {
    embed.addFields({ name: 'Freelancer', value: `<@${ticket.assigned_freelancer_id}>`, inline: true });
  }
  if (agreedPrice) embed.addFields({ name: 'Agreed price', value: agreedPrice.slice(0, 100), inline: true });
  if (ticket.deadline) {
    const unix = Math.floor(Date.parse(`${ticket.deadline}T12:00:00Z`) / 1000);
    embed.addFields({ name: 'Deadline', value: `${ticket.deadline} (<t:${unix}:R>)`, inline: true });
  }
  const estimate = estimateOrder(valueOf('size'));
  if (estimate) embed.addFields({ name: 'Estimate', value: formatEstimate(estimate), inline: true });
  if (valueOf('budget')) embed.addFields({ name: 'Budget', value: budgetLabel(valueOf('budget')), inline: true });
  return embed;
}

// --- Manager reports (/orders, /stats) ---

const TYPE_ICON = { order: '🧱', help: '❓', application: '📝' };

/**
 * /orders: one line per open ticket, overdue first. Capped to fit an embed; the count is exact.
 * @param {(object & { overdue: boolean })[]} tickets
 * @param {string | null} status
 * @param {string} guildId
 */
export function ordersOverviewEmbed(tickets, status, guildId) {
  const lines = tickets.map((t) => {
    const deadline = t.deadline ? ` · due ${t.deadline}` : '';
    const flag = t.overdue ? '⚠️ **OVERDUE** ' : '';
    return `${flag}${TYPE_ICON[t.type] ?? '🎫'} <#${t.client_channel_id}> · ${t.status} · <@${t.client_id}>${deadline}`;
  });
  let description = '';
  let shown = 0;
  for (const line of lines) {
    if (description.length + line.length + 1 > 3900) break;
    description += `${line}\n`;
    shown++;
  }
  if (shown < lines.length) description += `…and ${lines.length - shown} more — filter with \`status\`.`;
  const overdue = tickets.filter((t) => t.overdue).length;
  return new EmbedBuilder()
    .setColor(brandColor(guildId))
    .setTitle(`Open tickets${status ? ` · ${status}` : ''}: ${tickets.length}${overdue ? ` (${overdue} overdue)` : ''}`)
    .setDescription(description || 'Nothing open. 🎉')
    .setTimestamp();
}

/**
 * /stats embed.
 * @param {ReturnType<import('../modules/tickets/Reports.js').computeStats>} s
 * @param {number} days
 * @param {string} guildId
 */
export function statsEmbed(s, days, guildId) {
  const money = s.avgPrice != null ? `€${s.avgPrice}` : '—';
  const rating = s.avgRating != null ? `⭐ ${s.avgRating} (${s.reviews})` : '—';
  return new EmbedBuilder()
    .setColor(brandColor(guildId))
    .setTitle(`Last ${days} days`)
    .addFields(
      { name: 'Orders opened', value: String(s.orders), inline: true },
      { name: 'Paid', value: `${s.paid} (${s.conversion}%)`, inline: true },
      { name: 'Delivered', value: String(s.delivered), inline: true },
      { name: 'Avg agreed price', value: money, inline: true },
      { name: 'Reviews', value: rating, inline: true },
      { name: 'Help tickets', value: String(s.help), inline: true },
      { name: 'Team applications', value: `${s.applications} (${s.accepted} accepted)`, inline: true }
    )
    .setFooter({ text: 'Counted by when the ticket was opened. Paid = payment confirmed by a manager.' })
    .setTimestamp();
}

// --- Team application ---

/** "Fill application" / "Edit application" button (applicant). customId: start_application:ticketId */
export function startApplicationButtonRow(ticketId, label = 'Fill application') {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.START_APPLICATION}:${ticketId}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Team application modal, prefilled when editing. customId: application_modal:ticketId
 * @param {string} ticketId
 * @param {{ field_name: string, field_value: string }[]} fields
 * @returns {ModalBuilder}
 */
export function buildApplicationModal(ticketId, fields = []) {
  const valueByKey = Object.fromEntries(fields.map((f) => [f.field_name, f.field_value || '']));
  const modal = new ModalBuilder().setCustomId(`${PREFIX.APPLICATION_MODAL}:${ticketId}`).setTitle('Team application');
  const paragraphs = new Set(['about', 'experience', 'portfolio']);
  const required = new Set(['about', 'portfolio']);
  for (const [key, label] of Object.entries(APPLICATION_FIELDS)) {
    const input = new TextInputBuilder()
      .setCustomId(`field_${key}`)
      .setLabel(label)
      .setStyle(paragraphs.has(key) ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setValue((valueByKey[`app_${key}`] || '').slice(0, 4000))
      .setRequired(required.has(key));
    if (key === 'portfolio') input.setPlaceholder('Links to screenshots, Planet Minecraft, a website…');
    if (key === 'timezone') input.setPlaceholder('e.g. UTC+2');
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

/**
 * Application summary: embed + applicant's Edit button + managers' Accept / Reject.
 * @param {{ field_name: string, field_value: string }[]} fields
 * @param {string} ticketId
 * @param {string} applicantId
 * @param {string} [guildId]
 */
export function getApplicationSummaryPayload(fields, ticketId, applicantId, guildId) {
  const valueByKey = Object.fromEntries(fields.map((f) => [f.field_name, f.field_value || '']));
  const embed = new EmbedBuilder()
    .setColor(brandColor(guildId))
    .setTitle('Team application')
    .setDescription(`Applicant: <@${applicantId}>`)
    .setTimestamp();
  for (const [key, label] of Object.entries(APPLICATION_FIELDS)) {
    embed.addFields({ name: label, value: (valueByKey[`app_${key}`] || '-').slice(0, 1024), inline: false });
  }
  const decision = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX.ACCEPT_APPLICATION}:${ticketId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PREFIX.REJECT_APPLICATION}:${ticketId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
  );
  return {
    content: 'Managers: review the application below.',
    embeds: [embed],
    components: [startApplicationButtonRow(ticketId, 'Edit application'), decision],
  };
}

/** Reason modal for rejecting an application. customId: reject_application_modal:ticketId */
export function buildRejectApplicationModal(ticketId) {
  return new ModalBuilder()
    .setCustomId(`${PREFIX.REJECT_APPLICATION_MODAL}:${ticketId}`)
    .setTitle('Reject application')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reject_reason')
          .setLabel('Reason (sent to the applicant)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

// --- Website consent (phase 4) ---

const CONSENT_QUESTION = {
  portfolio:
    '🖼️ **May we show this build in the SouCampus portfolio** (soucampus.online)? ' +
    'Screenshots and build facts only — never your name. The team reviews it before anything is published.',
  review: '💬 **May we show your review on soucampus.online**, signed with your Discord display name?',
};

/**
 * Yes / No question to the client. customId: site_consent:ticketId:portfolio|review:yes|no
 * @param {string} ticketId
 * @param {'portfolio' | 'review'} what
 */
export function siteConsentPayload(ticketId, what) {
  const button = (answer, label, style) =>
    new ButtonBuilder().setCustomId(`${PREFIX.SITE_CONSENT}:${ticketId}:${what}:${answer}`).setLabel(label).setStyle(style);
  return {
    content: CONSENT_QUESTION[what],
    components: [
      new ActionRowBuilder().addComponents(
        button('yes', 'Yes, show it', ButtonStyle.Success),
        button('no', 'No, keep it private', ButtonStyle.Secondary)
      ),
    ],
  };
}

// --- Closing tickets ---

/** "Close ticket" button (client or manager, see closeRefusal). customId: close_ticket:ticketId */
export function closeTicketButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.CLOSE_TICKET}:${ticketId}`)
    .setLabel('Close ticket')
    .setStyle(ButtonStyle.Danger);
  return new ActionRowBuilder().addComponents(button);
}

/** "Keep archived" button (manager) under the closed-ticket notice. customId: keep_channel:ticketId */
export function keepChannelButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.KEEP_CHANNEL}:${ticketId}`)
    .setLabel('Keep archived')
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Notice posted in a ticket channel when it is closed.
 * @param {string} closedById
 * @param {number} deleteAtMs
 * @returns {string}
 */
export function ticketClosedText(closedById, deleteAtMs) {
  const at = Math.floor(deleteAtMs / 1000);
  return (
    `🔒 Ticket closed by <@${closedById}>. This channel is now read-only and will be deleted <t:${at}:R>.\n` +
    'A manager can keep it archived instead.'
  );
}

// --- Payment (STEP 8) ---

/** "Confirm Payment Received" button (manager only, in freelancer channel). customId: confirm_payment:ticketId */
export function confirmPaymentButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.CONFIRM_PAYMENT}:${ticketId}`)
    .setLabel('Confirm Payment Received')
    .setStyle(ButtonStyle.Success);
  return new ActionRowBuilder().addComponents(button);
}

// --- Extend Deadline (STEP 9) ---

/** "Extend Deadline" button (manager). customId: extend_deadline:ticketId */
export function extendDeadlineButtonRow(ticketId) {
  const button = new ButtonBuilder()
    .setCustomId(`${PREFIX.EXTEND_DEADLINE}:${ticketId}`)
    .setLabel('Extend Deadline')
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(button);
}

/**
 * Build Extend Deadline modal. customId: extend_deadline_modal:ticketId
 * @param {string} ticketId
 * @param {string} [currentDeadline]
 * @returns {ModalBuilder}
 */
export function buildExtendDeadlineModal(ticketId, currentDeadline = '') {
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX.EXTEND_DEADLINE_MODAL}:${ticketId}`)
    .setTitle('Extend Deadline');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('new_deadline')
        .setLabel('New deadline date')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 25.12.2026 or in 2 weeks')
        .setValue(currentDeadline.slice(0, 4000))
        .setRequired(true)
    )
  );
  return modal;
}
