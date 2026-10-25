/**
 * Slash command /invite @user — invite a user to the current ticket channel (manager/admin only).
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getTicketByChannelId } from '../modules/tickets/TicketRepository.js';
import { isManagerOrAdmin } from '../utils/permissions.js';
import { replyError } from '../utils/replies.js';
import { logger } from '../utils/logger.js';

export const inviteCommandData = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('Invite a user to this ticket channel (manager only)')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('User to invite to the ticket').setRequired(true)
  )
  .toJSON();

export async function handleInviteCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'invite') return;
  const channel = interaction.channel;
  const member = interaction.member;
  if (!channel?.guild || !member) {
    await interaction.reply({ content: 'This command can only be used in a server channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!isManagerOrAdmin(member)) {
    await interaction.reply({ content: 'Only a manager or admin can invite users to a ticket.', flags: MessageFlags.Ephemeral });
    return;
  }
  const ticket = getTicketByChannelId(channel.id);
  if (!ticket) {
    await interaction.reply({ content: 'This channel is not a ticket channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  const user = interaction.options.getUser('user');
  if (!user) {
    await interaction.reply({ content: 'Please specify a user to invite.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
    });
    await interaction.reply({
      content: `✅ <@${user.id}> has been invited to this ticket.`,
    });
    logger.info('User invited to ticket', { ticketId: ticket.id, channelId: channel.id, userId: user.id });
  } catch (err) {
    logger.error('invite command failed', { channelId: channel.id, error: err.message });
    await replyError(interaction, 'Failed to invite user.');
  }
}
