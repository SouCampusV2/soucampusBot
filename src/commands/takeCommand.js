/**
 * Slash command /take — a manager takes an order themselves (or gives it to a builder) without
 * waiting for quotes. Used while the team has no builders yet.
 *
 * Run in the order's ticket channel or its quote channel. It does what Accept on a quote does:
 * an accepted proposal, the ticket open → assigned, the builder let into the client channel,
 * and the "Confirm Payment Received" button in the quote channel.
 *
 * /paylink — a manager posts a "Pay" button (PayPal / Wise link) in the order's ticket, e.g. the
 * second half of a 50/50 payment. /take can post the first one with its payment_link option.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getTicketByChannelId } from '../modules/tickets/TicketRepository.js';
import { createProposal, acceptProposal } from '../modules/proposals/ProposalRepository.js';
import { STATUS } from '../modules/tickets/TicketStatus.js';
import { isManagerOrAdmin } from '../utils/permissions.js';
import { quoteEmbed, confirmPaymentButtonRow } from '../embeds/templates.js';
import { addTicketMember } from '../modules/clients/ClientTiers.js';
import { replyError } from '../utils/replies.js';
import { logger } from '../utils/logger.js';

export const takeCommandData = new SlashCommandBuilder()
  .setName('take')
  .setDescription('Take this order as its builder, without waiting for quotes (managers only)')
  .setDMPermission(false)
  .addStringOption((o) => o.setName('price').setDescription('Agreed price, e.g. €550').setRequired(true).setMaxLength(100))
  .addStringOption((o) => o.setName('deadline').setDescription('When it will be done (defaults to the client\'s deadline)').setMaxLength(100))
  .addStringOption((o) => o.setName('note').setDescription('A short note for the client').setMaxLength(1000))
  .addUserOption((o) => o.setName('builder').setDescription('Who builds it (defaults to you)'))
  .addStringOption((o) => o.setName('payment_link').setDescription('PayPal / Wise invoice link — the client gets a Pay button').setMaxLength(512))
  .addStringOption((o) => o.setName('payment_amount').setDescription('What this link charges, e.g. $240 (50%) — defaults to the price').setMaxLength(100))
  .addUserOption((o) => o.setName('payer').setDescription('Who pays (defaults to the client who opened the ticket)'))
  .toJSON();

export const paylinkCommandData = new SlashCommandBuilder()
  .setName('paylink')
  .setDescription('Post a Pay button with an invoice link in this order (managers only)')
  .setDMPermission(false)
  .addStringOption((o) => o.setName('link').setDescription('PayPal / Wise invoice link (https://…)').setRequired(true).setMaxLength(512))
  .addStringOption((o) => o.setName('amount').setDescription('What it charges, e.g. $240 (second half)').setRequired(true).setMaxLength(100))
  .addStringOption((o) => o.setName('note').setDescription('A short note for the client').setMaxLength(500))
  .addUserOption((o) => o.setName('payer').setDescription('Who pays (defaults to the client who opened the ticket)'))
  .toJSON();

const LINK_RE = /^https:\/\/\S+$/;

/**
 * Message with a link button the client pays through. Link buttons have no customId — pressing
 * one only opens the page, so there is nothing to guard.
 * @param {string} clientId
 * @param {string} link
 * @param {string} amount
 * @param {string} [note]
 */
export function paymentLinkPayload(clientId, link, amount, note = '') {
  // clientId here is whoever pays (the payer option), the ticket author by default.
  const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel(`Pay ${amount}`.slice(0, 80)).setEmoji('💳');
  return {
    content: `💳 <@${clientId}>, here is the invoice for **${amount}**.${note ? `\n${note}` : ''}\nOnce it's paid, a manager confirms it here.`,
    components: [new ActionRowBuilder().addComponents(button)],
    allowedMentions: { users: [clientId] },
  };
}

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/**
 * Who pays: the payer option, else the ticket author. A payer who is not in the ticket yet is
 * let into the client channel and counted as a client of the order (client tiers).
 * @returns {Promise<string>} the payer's user id
 */
async function resolvePayer(interaction, ticket, clientChannel) {
  const payer = interaction.options.getUser('payer');
  if (!payer || payer.bot || payer.id === ticket.client_id) return ticket.client_id;
  if (payer.id !== ticket.assigned_freelancer_id) addTicketMember(ticket.id, payer.id, interaction.user.id);
  await clientChannel?.permissionOverwrites?.edit(payer.id, { ViewChannel: true, SendMessages: true });
  return payer.id;
}

export async function handleTakeCommand(interaction) {
  if (!isManagerOrAdmin(interaction.member)) {
    await interaction.reply(ephemeral('Only managers can assign an order.'));
    return;
  }
  const ticket = getTicketByChannelId(interaction.channelId ?? interaction.channel?.id);
  if (!ticket || ticket.type !== 'order') {
    await interaction.reply(ephemeral('Run this in an order\'s ticket channel or its quote channel.'));
    return;
  }
  if (ticket.status !== STATUS.OPEN) {
    const why = [STATUS.ASSIGNED, STATUS.PAID, STATUS.COMPLETED].includes(ticket.status)
      ? 'This order already has a builder.'
      : 'This order is not submitted yet — the client has to press Submit order first.';
    await interaction.reply(ephemeral(why));
    return;
  }
  const builder = interaction.options.getUser('builder') ?? interaction.user;
  if (builder.bot) {
    await interaction.reply(ephemeral('A bot cannot build an order.'));
    return;
  }
  const price = interaction.options.getString('price').trim();
  const deadline = interaction.options.getString('deadline')?.trim() || ticket.deadline || '';
  const message = interaction.options.getString('note')?.trim() || '';
  const paymentLink = interaction.options.getString('payment_link')?.trim() || '';
  if (paymentLink && !LINK_RE.test(paymentLink)) {
    await interaction.reply(ephemeral('payment_link must be an https:// link.'));
    return;
  }
  const paymentAmount = interaction.options.getString('payment_amount')?.trim() || price;

  const { id: proposalId } = createProposal({ ticketId: ticket.id, freelancerId: builder.id, price, deadline, message });
  // The transition decides: if someone accepted a quote a moment ago, nothing is assigned.
  if (!acceptProposal(proposalId, ticket.id, builder.id)) {
    await interaction.reply(ephemeral('This order already has a builder.'));
    return;
  }
  // Assigned; the channel work below is slow — answer within Discord's 3 seconds first.
  await interaction.reply(ephemeral(`✅ <@${builder.id}> is now the builder of order #${ticket.number ?? ''}.`));

  try {
    const embed = quoteEmbed({ price, deadline, message }, builder.displayName || builder.username || 'Builder');
    const clientChannel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (clientChannel) {
      await clientChannel.permissionOverwrites?.edit(builder.id, { ViewChannel: true, SendMessages: true });
      await clientChannel.send({
        content: `🧱 <@${ticket.client_id}>, <@${builder.id}> will build your order. Here are the price and deadline:`,
        embeds: [embed],
        allowedMentions: { users: [ticket.client_id] },
      });
      if (paymentLink) {
        const payerId = await resolvePayer(interaction, ticket, clientChannel);
        await clientChannel.send(paymentLinkPayload(payerId, paymentLink, paymentAmount));
      }
    }
    const quoteChannel = ticket.freelancer_channel_id
      ? await interaction.client.channels.fetch(ticket.freelancer_channel_id).catch(() => null)
      : null;
    if (quoteChannel) {
      await quoteChannel.send({
        content: `📌 Taken by <@${builder.id}> — quotes are closed. Manager: confirm when the payment is received.`,
        embeds: [embed],
        components: [confirmPaymentButtonRow(ticket.id)],
        allowedMentions: { parse: [] },
      });
    }
    logger.info('Order taken by command', { ticketId: ticket.id, builderId: builder.id, by: interaction.user.id });
  } catch (err) {
    logger.error('/take failed after assigning', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'The builder is assigned, but posting to the channels failed.');
  }
}

export async function handlePaylinkCommand(interaction) {
  if (!isManagerOrAdmin(interaction.member)) {
    await interaction.reply(ephemeral('Only managers can post a payment link.'));
    return;
  }
  const ticket = getTicketByChannelId(interaction.channelId ?? interaction.channel?.id);
  if (!ticket || ticket.type !== 'order') {
    await interaction.reply(ephemeral("Run this in an order's ticket channel."));
    return;
  }
  const link = interaction.options.getString('link').trim();
  if (!LINK_RE.test(link)) {
    await interaction.reply(ephemeral('The link must start with https://'));
    return;
  }
  const amount = interaction.options.getString('amount').trim();
  const note = interaction.options.getString('note')?.trim() || '';
  // Ephemeral confirmation first, then the public message in the client's channel.
  await interaction.reply(ephemeral('✅ Payment link posted.'));
  try {
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (!channel) return;
    const payerId = await resolvePayer(interaction, ticket, channel);
    await channel.send(paymentLinkPayload(payerId, link, amount, note));
    logger.info('Payment link posted', { ticketId: ticket.id, by: interaction.user.id });
  } catch (err) {
    logger.error('/paylink failed', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'Could not post the link.');
  }
}
