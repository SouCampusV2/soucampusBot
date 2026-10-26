/**
 * All embed builders and action components in one place.
 */

import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  FileUploadBuilder,
} from 'discord.js';
import {
  PREFIX,
  TICKET_TYPES,
  ORDER_BUDGET_OPTIONS,
  APPLICATION_FIELDS,
  REQUIRED_ORDER_FIELDS,
  MINECRAFT_VERSIONS,
  MAX_REFERENCE_FILES,
  REFERENCE_MESSAGES_FIELD,
} from '../constants.js';
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

/** Site links on the panel. Legal pages are settings (/setup links): until the site has its
 *  Discord terms page, the general /terms and /privacy are the honest defaults. */
const SITE_URL = 'https://soucampus.online';
const DEFAULT_TERMS_URL = `${SITE_URL}/terms`;
const DEFAULT_PRIVACY_URL = `${SITE_URL}/privacy`;

/** One panel section: text on the left, its own button on the right. */
function panelSection(text, customId, label, style) {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .setButtonAccessory(new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style));
}

/**
 * The ticket panel — a Components V2 card (like the panels of other build studios):
 * optional banner, who we are, one section per ticket type with its own button (the button
 * opens that ticket straight away), legal note, link buttons. Edited in place by /setup panel.
 * @param {string} guildId
 * @param {{ guildName?: string }} [options]
 */
export function getTicketPanelPayload(guildId, { guildName } = {}) {
  const terms = getSetting(guildId, 'terms_url') || DEFAULT_TERMS_URL;
  const privacy = getSetting(guildId, 'privacy_url') || DEFAULT_PRIVACY_URL;
  const banner = getSetting(guildId, 'panel_banner_url');

  const card = new ContainerBuilder().setAccentColor(brandColor(guildId));
  if (banner) card.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)));
  card
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${guildName || 'SouCampus Builds'}\n` +
          'Custom Minecraft maps for your server — spawns, hubs, arenas, RPG worlds and more.\n' +
          'Pick what you need below: a private ticket opens just for you and our team.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addSectionComponents(
      panelSection(
        '### 🧱 Order a build\n' +
          'Fill a short form and get a price guide right away — about **€1.5 per block of map side** ' +
          '(150×150 ≈ €225). Builders send their quotes, you pick one.',
        `${PREFIX.CREATE_TICKET}:${TICKET_TYPES.ORDER}`,
        'Start my project',
        ButtonStyle.Success
      ),
      panelSection(
        '### ❓ Support\nQuestions about an order, a map you bought, or anything else — we answer here.',
        `${PREFIX.CREATE_TICKET}:${TICKET_TYPES.HELP}`,
        'Get support',
        ButtonStyle.Secondary
      ),
      panelSection(
        '### 📝 Join the team\nYou build? Show your portfolio and apply to take orders with us.',
        `${PREFIX.CREATE_TICKET}:${TICKET_TYPES.APPLICATION}`,
        'Apply',
        ButtonStyle.Secondary
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# By opening a ticket you agree to our Terms. When a ticket closes, its conversation is saved ' +
          'as a transcript and sent to you; the channel is deleted after 48 hours.'
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(SITE_URL).setLabel('Website'),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(`${SITE_URL}/portfolio`).setLabel('Portfolio'),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(terms).setLabel('Terms'),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(privacy).setLabel('Privacy')
      )
    );
  return { components: [card], flags: MessageFlags.IsComponentsV2 };
}

// --- Components V2 building blocks (ticket cards) ---

const text = (content) => new TextDisplayBuilder().setContent(content);
const divider = (spacing = SeparatorSpacingSize.Small) => new SeparatorBuilder().setSpacing(spacing);
/** A V2 message is ONLY components: no content, no embeds (Discord rejects the mix). */
const v2 = (card) => ({ components: [card], flags: MessageFlags.IsComponentsV2 });
/** V2 caps the text of a whole message at 4000 characters — long answers are clipped for display. */
const clip = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

// --- Ticket welcome cards (first message of every ticket) ---

const WELCOME = {
  [TICKET_TYPES.ORDER]: (userId) =>
    '# 🧱 Your order\n' +
    `Hi <@${userId}>, thanks for choosing us! This channel is private — only you and our team can see it.`,
  [TICKET_TYPES.HELP]: (userId) =>
    '# ❓ Support\n' + `Hi <@${userId}>! Tell us what is going on and a team member will answer right here.`,
  [TICKET_TYPES.APPLICATION]: (userId) =>
    '# 📝 Join the team\n' + `Hi <@${userId}>! We are always looking for builders who love detail.`,
};

const WELCOME_BODY = {
  [TICKET_TYPES.ORDER]:
    '### How it works\n' +
    '**1 · Finish the details** — Minecraft version and deadline, on the card below.\n' +
    '**2 · Submit** — builders get your request and send their quotes right here.\n' +
    '**3 · Pick a builder** — compare price, deadline and reviews. Questions first? Press **Contact freelancer**.\n' +
    '**4 · Pay, then relax** — a manager confirms the payment and the builder gets to work.\n' +
    '**5 · Get your build** — and tell others how it went with a review.',
  [TICKET_TYPES.HELP]:
    '### Help us help you faster\n' +
    '• which order or map it is about\n' +
    '• what you expected, and what happened instead\n' +
    '• screenshots or a short video, if you have them',
  [TICKET_TYPES.APPLICATION]:
    '### What we look at\n' +
    '• **Portfolio** — screenshots, Planet Minecraft, a website\n' +
    '• **Styles** you are strongest in\n' +
    '• **Time** — how many hours a week you can build\n' +
    '### Next step\n' +
    'Press **Fill application** — a manager reviews it here and answers in this channel.',
};

/**
 * The first message of a ticket: who it is for, what happens next, and the ticket's buttons.
 * Rebuilt with `closed` when the ticket closes — a V2 message cannot just drop its components,
 * they ARE its content.
 * @param {{ id: string, type: string, client_id: string, guild_id?: string }} ticket
 * @param {{ closed?: boolean }} [options]
 */
export function ticketWelcomePayload(ticket, { closed = false } = {}) {
  const card = new ContainerBuilder()
    .setAccentColor(brandColor(ticket.guild_id))
    .addTextDisplayComponents(text(WELCOME[ticket.type](ticket.client_id)))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(WELCOME_BODY[ticket.type]))
    .addSeparatorComponents(divider());
  if (closed) return v2(card.addTextDisplayComponents(text(`-# Ticket \`${ticket.id}\` · 🔒 Closed`)));

  card.addTextDisplayComponents(
    text(`-# Ticket \`${ticket.id}\` · Anything unclear? Just write in this channel — a manager will answer.`)
  );
  const row = new ActionRowBuilder();
  if (ticket.type === TICKET_TYPES.APPLICATION) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`${PREFIX.START_APPLICATION}:${ticket.id}`).setLabel('Fill application').setStyle(ButtonStyle.Primary)
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX.CLOSE_TICKET}:${ticket.id}`).setLabel('Close ticket').setStyle(ButtonStyle.Secondary)
  );
  return v2(card.addActionRowComponents(row));
}

// --- Order form (STEP 2 & 3) ---

/** Human-readable labels of order answers (summary, order card, freelancer brief). */
export const ORDER_FIELD_LABELS = {
  need: 'What to build',
  size: 'Size',
  theme: 'Style',
  budget: 'Budget & timeframe',
  version: 'Minecraft version',
  deadline: 'Deadline',
  extra_details: 'Extra details',
  reference_urls: 'References',
};

/** Max length of each answer — keeps a whole summary under the 4000-character V2 limit. */
const ORDER_MAX_LENGTH = { need: 1500, size: 100, theme: 100, budget: 300, deadline: 100, extra_details: 800 };

/** '100-500' -> '€100–€500' for budgets from the old menu; free text (the modal) stays as typed. */
export function budgetLabel(value) {
  return ORDER_BUDGET_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** '1.16-1.19' -> 'Java 1.16 – 1.19'; versions typed in the old form stay as typed. */
export function versionLabel(value) {
  return MINECRAFT_VERSIONS.find((o) => o.value === value)?.label ?? value;
}

/** A modal question: label + hint above an input (Discord's Label component). */
function question(label, description, component) {
  const item = new LabelBuilder().setLabel(label).setDescription(description);
  if (component instanceof TextInputBuilder) return item.setTextInputComponent(component);
  if (component instanceof StringSelectMenuBuilder) return item.setStringSelectMenuComponent(component);
  return item.setFileUploadComponent(component);
}

function answerInput(key, value, { paragraph = false, placeholder } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(`field_${key}`)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(ORDER_MAX_LENGTH[key])
    .setRequired(REQUIRED_ORDER_FIELDS.includes(key));
  if (placeholder) input.setPlaceholder(placeholder);
  if (value) input.setValue(value.slice(0, ORDER_MAX_LENGTH[key]));
  return input;
}

/**
 * The order modal — the whole brief in one window, like the commission forms of other studios.
 * From the panel (no ticketId): customId order_new, submitting it creates the ticket.
 * In a ticket: Edit order, prefilled; customId edit_order_modal:ticketId. Files cannot be
 * prefilled — on edit the upload adds more references.
 * @param {string | null} ticketId
 * @param {{ field_name: string, field_value: string }[]} [fields]
 */
export function buildOrderModal(ticketId, fields = []) {
  const value = Object.fromEntries(fields.map((f) => [f.field_name, f.field_value || '']));
  const modal = new ModalBuilder()
    .setCustomId(ticketId ? `${PREFIX.EDIT_ORDER_MODAL}:${ticketId}` : PREFIX.ORDER_NEW_MODAL)
    .setTitle(ticketId ? 'Edit your order' : 'Start your order');
  return modal.addLabelComponents(
    question(
      'What should we build?',
      'Spawn, hub, lobby, arena, RPG map… The more detail, the better the quotes.',
      answerInput('need', value.need, { paragraph: true, placeholder: 'e.g. A medieval spawn: castle, market and 4 portals to game modes' })
    ),
    question(
      'Build size',
      'In blocks. Guide: about €1.5 per block of side (150×150 ≈ €225).',
      answerInput('size', value.size, { placeholder: 'e.g. 150x150' })
    ),
    question('Style / theme', 'The look you are after.', answerInput('theme', value.theme, { placeholder: 'e.g. Medieval, Japanese, Fantasy, Modern' })),
    question(
      'Budget and timeframe',
      'Leave empty if you do not know yet — the builders will suggest.',
      answerInput('budget', value.budget ? budgetLabel(value.budget) : '', { paragraph: true, placeholder: 'e.g. €300, ready in 3 weeks' })
    ),
    question(
      ticketId ? 'Add more references' : 'References',
      `Screenshots, sketches or schematics you like (up to ${MAX_REFERENCE_FILES} files).`,
      new FileUploadBuilder().setCustomId('field_references').setMinValues(0).setMaxValues(MAX_REFERENCE_FILES).setRequired(false)
    )
  );
}

/**
 * Version & deadline modal (in the ticket, after the order modal). customId order_finish_modal:ticketId
 * @param {string} ticketId
 * @param {{ field_name: string, field_value: string }[]} [fields]
 */
export function buildOrderFinishModal(ticketId, fields = []) {
  const value = Object.fromEntries(fields.map((f) => [f.field_name, f.field_value || '']));
  const versions = new StringSelectMenuBuilder()
    .setCustomId('field_version')
    .setPlaceholder('Choose a version')
    .setRequired(true)
    .addOptions(MINECRAFT_VERSIONS.map((o) => ({ ...o, default: o.value === value.version })));
  return new ModalBuilder()
    .setCustomId(`${PREFIX.ORDER_FINISH_MODAL}:${ticketId}`)
    .setTitle('Version & deadline')
    .addLabelComponents(
      question('Minecraft version', 'The version your server runs.', versions),
      question(
        'Deadline',
        'A date, e.g. 25.12.2026 or "in 3 weeks". The builder gets reminders before it.',
        answerInput('deadline', value.deadline, { placeholder: 'e.g. 25.12.2026' })
      ),
      question(
        'Anything else?',
        'Plugins, links (Pinterest, YouTube), must-haves, things to avoid…',
        answerInput('extra_details', value.extra_details, { paragraph: true })
      )
    );
}

/**
 * The answers as card text. `references` says where the files are for this reader.
 * @param {{ field_name: string, field_value: string }[]} fields
 * @param {string | null} references - e.g. 'posted in this channel', null = none
 */
function orderDetailsText(fields, references) {
  const value = Object.fromEntries(fields.map((f) => [f.field_name, (f.field_value ?? '').trim()]));
  const missing = '`❗ not set yet`';
  const lines = [
    `**🧱 ${ORDER_FIELD_LABELS.need}**\n${clip(value.need || missing, 1500)}`,
    `**📐 ${ORDER_FIELD_LABELS.size}:** ${clip(value.size || missing, 100)}   **🎨 ${ORDER_FIELD_LABELS.theme}:** ${clip(value.theme || missing, 100)}`,
    `**🧩 ${ORDER_FIELD_LABELS.version}:** ${value.version ? versionLabel(value.version) : missing}`,
    `**📅 ${ORDER_FIELD_LABELS.deadline}:** ${clip(value.deadline || missing, 100)}`,
    `**💶 ${ORDER_FIELD_LABELS.budget}:** ${value.budget ? clip(budgetLabel(value.budget), 300) : '_not given — open to suggestions_'}`,
  ];
  if (references) lines.push(`**🖼️ ${ORDER_FIELD_LABELS.reference_urls}:** ${references}`);
  if (value.reference_urls) lines.push(`**🔗 Reference links**\n${clip(value.reference_urls, 300)}`);
  if (value.extra_details) lines.push(`**📝 ${ORDER_FIELD_LABELS.extra_details}**\n${clip(value.extra_details, 800)}`);
  const estimate = estimateOrder(value.size);
  if (estimate) lines.push(`**💡 Price guide:** ${formatEstimate(estimate)} — the builder's quote sets the real price`);
  return lines.join('\n');
}

/** Labels of the required answers asked in the order modal (the rest are in Version & deadline). */
const BRIEF_LABELS = ['need', 'size', 'theme'].map((k) => ORDER_FIELD_LABELS[k]);

/** True when the order has reference files posted in its channel. */
function hasReferenceFiles(fields) {
  return Boolean(fields.find((f) => f.field_name === REFERENCE_MESSAGES_FIELD)?.field_value);
}

/**
 * The order summary card in the client's channel — edited in place by Version & deadline,
 * Edit order and Submit order. Before submitting: what is still missing + Submit (disabled
 * until complete). After: "submitted"; the edit buttons stay while the order is open.
 * @param {{ id: string, status: string, guild_id?: string }} ticket
 * @param {{ field_name: string, field_value: string }[]} fields
 */
export function getOrderSummaryPayload(ticket, fields) {
  const submitted = ticket.status !== 'form';
  const missing = missingOrderFields(fields);
  const card = new ContainerBuilder()
    .setAccentColor(brandColor(ticket.guild_id))
    .addTextDisplayComponents(text(`## 📋 Order summary\n-# Ticket \`${ticket.id}\``))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(orderDetailsText(fields, hasReferenceFiles(fields) ? 'posted in this channel' : null)))
    .addSeparatorComponents(divider());

  let status;
  if (submitted) status = '📨 **Submitted** — builders are looking at it. Their quotes will appear in this channel.';
  else if (missing.length) {
    // Point at the button whose modal asks the missing answer (an order from the old type menu has none yet).
    const where = missing.some((m) => BRIEF_LABELS.includes(m)) ? 'Edit order' : 'Version & deadline';
    status = `⬇️ **Almost there!** Still needed: **${missing.join('**, **')}** — press **${where}**.`;
  }
  else status = '✅ **Ready to go.** Check everything, then press **Submit order** — builders only see your order after that.';
  card.addTextDisplayComponents(text(status));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX.ORDER_FINISH}:${ticket.id}`)
      .setLabel('Version & deadline')
      .setStyle(!submitted && missing.length ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${PREFIX.EDIT_ORDER}:${ticket.id}`).setLabel('Edit order').setStyle(ButtonStyle.Secondary)
  );
  if (!submitted) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX.SUBMIT_ORDER}:${ticket.id}`)
        .setLabel('Submit order')
        .setStyle(ButtonStyle.Success)
        .setDisabled(missing.length > 0)
    );
  }
  return v2(card.addActionRowComponents(row));
}

/**
 * Required answers still empty, as human labels — for the summary and the Submit refusal.
 * @param {{ field_name: string, field_value: string }[]} fields
 * @returns {string[]}
 */
export function missingOrderFields(fields) {
  const filled = new Set(fields.filter((f) => (f.field_value ?? '').trim()).map((f) => f.field_name));
  return REQUIRED_ORDER_FIELDS.filter((k) => !filled.has(k)).map((k) => ORDER_FIELD_LABELS[k] ?? k);
}

/** Refusal when the client tries to edit an order that a freelancer already priced and took. */
export const EDIT_CLOSED_TEXT =
  'This order can no longer be edited — a freelancer has already taken it. Talk to them or a manager about changes.';

/** Caption of the message that carries the client's reference files. */
export function referencesCaption(clientId, { forFreelancers = false } = {}) {
  return forFreelancers ? '🖼️ **References from the client**' : `🖼️ **References** from <@${clientId}>`;
}

// --- Freelancer channel (STEP 4) ---

/**
 * The order as freelancers see it in the quote channel: the brief + Submit Quote / Send Message /
 * Not Interested. `updated`: the client edited the order — same brief, no buttons (the first
 * post keeps them).
 * @param {{ id: string, client_id: string, guild_id?: string }} ticket
 * @param {{ field_name: string, field_value: string }[]} fields
 * @param {{ updated?: boolean }} [options]
 */
export function orderBriefPayload(ticket, fields, { updated = false } = {}) {
  // The client is shown on purpose (owner's decision 2026-10-27): the quote channel is named
  // after them anyway, and on one server everyone sees each other — pretending otherwise misleads.
  const card = new ContainerBuilder()
    .setAccentColor(brandColor(ticket.guild_id))
    .addTextDisplayComponents(
      text(
        (updated ? '## 📝 The client updated the order' : '## 🧱 New order — request for quote') +
          `\nClient: <@${ticket.client_id}> · Ticket \`${ticket.id}\``
      )
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(orderDetailsText(fields, hasReferenceFiles(fields) ? 'files below' : null)));
  if (updated) return v2(card);
  return v2(
    card
      .addSeparatorComponents(divider())
      .addTextDisplayComponents(
        text(
          '-# **Submit Quote** — your price and deadline; the client sees it with your rating. ' +
            '**Send Message** — ask the client first. **Not Interested** — hides this channel for you.'
        )
      )
      .addActionRowComponents(...freelancerActionButtonRows(ticket.id))
  );
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
    .setTitle('💰 Quote');
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
    content: '📝 **New team application** — managers, review it below. The applicant can still edit it until you decide.',
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
