/**
 * Slash command /take — a manager takes an order themselves (or gives it to a builder) without
 * waiting for quotes. Used while the team has no builders yet.
 *
 * Run in the order's ticket channel or its quote channel. It does what Accept on a quote does:
 * an accepted proposal, the ticket open → assigned, the builder let into the client channel,
 * and the "Confirm Payment Received" button in the quote channel.
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getTicketByChannelId } from '../modules/tickets/TicketRepository.js';
import { createProposal, acceptProposal } from '../modules/proposals/ProposalRepository.js';
import { STATUS } from '../modules/tickets/TicketStatus.js';
import { isManagerOrAdmin } from '../utils/permissions.js';
import { quoteEmbed, confirmPaymentButtonRow } from '../embeds/templates.js';
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
  .toJSON();

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

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
