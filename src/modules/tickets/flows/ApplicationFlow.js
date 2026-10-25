/**
 * Team application flow: someone applies to join the build team as a freelancer.
 *
 * The applicant gets their own channel (apply-<name>, visible to them and managers), fills a
 * form there, and a manager accepts (Freelancer role is given) or rejects (with a reason sent
 * to the applicant). Status: open → accepted | rejected (TicketStatus.js).
 *
 * Handlers live here (not one file each under interactions/handlers) because they share the
 * same lookups and checks; TicketModule registers them by prefix like any other handler.
 */

import { MessageFlags } from 'discord.js';
import { getTicketById, getTicketFields, saveTicketField } from '../TicketRepository.js';
import { STATUS, transitionTicket } from '../TicketStatus.js';
import { ensureTicketClient, isManagerOrAdmin, getFreelancerRole } from '../../../utils/permissions.js';
import {
  startApplicationButtonRow,
  buildApplicationModal,
  getApplicationSummaryPayload,
  buildRejectApplicationModal,
} from '../../../embeds/templates.js';
import { APPLICATION_FIELDS } from '../../../constants.js';
import { replyError } from '../../../utils/replies.js';
import { logger } from '../../../utils/logger.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/** Ticket for this interaction if it is an application, else answers and returns null. */
async function applicationTicket(interaction, ticketId) {
  const ticket = ticketId ? getTicketById(ticketId) : undefined;
  if (ticket?.type !== 'application') {
    await interaction.reply(ephemeral('Application not found.'));
    return null;
  }
  return ticket;
}

/** Best-effort DM; closed DMs are normal, the channel message is the record. */
async function dm(client, userId, content) {
  const user = await client.users.fetch(userId).catch(() => null);
  await user?.send(content).catch(() => {});
}

/**
 * Called from confirmTicket for application tickets.
 * @param {import('discord.js').TextChannel} channel
 * @param {string} ticketId
 */
export async function startApplicationFlow(channel, ticketId) {
  await channel.send({
    content: 'Want to join the build team? Click below and tell us about yourself — a manager will review it here.',
    components: [startApplicationButtonRow(ticketId)],
  });
}

/** start_application:ticketId — open the form (prefilled when editing). Applicant only, while undecided. */
export async function handleStartApplication(interaction, parts) {
  const ticket = await applicationTicket(interaction, parts[1]);
  if (!ticket) return;
  if (!(await ensureTicketClient(interaction, ticket))) return;
  if (ticket.status !== STATUS.OPEN) {
    await interaction.reply(ephemeral('This application has already been decided.'));
    return;
  }
  await interaction.showModal(buildApplicationModal(ticket.id, getTicketFields(ticket.id)));
}

/** application_modal:ticketId — save the answers and (re)post the summary for managers. */
export async function handleApplicationModal(interaction, parts) {
  const ticket = await applicationTicket(interaction, parts[1]);
  if (!ticket) return;
  if (!(await ensureTicketClient(interaction, ticket))) return;
  if (ticket.status !== STATUS.OPEN) {
    await interaction.reply(ephemeral('This application has already been decided.'));
    return;
  }
  try {
    for (const key of Object.keys(APPLICATION_FIELDS)) {
      saveTicketField(ticket.id, `app_${key}`, interaction.fields.getTextInputValue(`field_${key}`)?.trim() || '');
    }
    await interaction.reply(ephemeral('Application sent! A manager will review it in this channel.'));
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    if (channel) {
      await channel.send(getApplicationSummaryPayload(getTicketFields(ticket.id), ticket.id, ticket.client_id, ticket.guild_id));
    }
    logger.info('Application submitted', { ticketId: ticket.id });
  } catch (err) {
    logger.error('application_modal failed', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'Failed to save the application.');
  }
}

/** accept_application:ticketId — manager accepts: status accepted, Freelancer role, notify. */
export async function handleAcceptApplication(interaction, parts) {
  const ticket = await applicationTicket(interaction, parts[1]);
  if (!ticket) return;
  if (!isManagerOrAdmin(interaction.member)) {
    await interaction.reply(ephemeral('Only a manager can accept applications.'));
    return;
  }
  if (!transitionTicket(ticket.id, STATUS.ACCEPTED)) {
    await interaction.reply(ephemeral('This application has already been decided.'));
    return;
  }
  try {
    await interaction.update({ content: `✅ Accepted by <@${interaction.user.id}>.`, components: [] });
    const role = getFreelancerRole(interaction.guild);
    const member = await interaction.guild.members.fetch(ticket.client_id).catch(() => null);
    let roleNote = '';
    if (!role) {
      roleNote = ' ⚠️ No Freelancer role is configured — give it by hand or run `/setup freelancer_role`.';
    } else if (!member) {
      roleNote = ' ⚠️ The applicant is no longer on the server, so no role was given.';
    } else {
      await member.roles.add(role.id, 'Team application accepted').catch((err) => {
        roleNote = ' ⚠️ Could not give the Freelancer role — check that the bot role is above it.';
        logger.warn('accept_application: role add failed', { ticketId: ticket.id, error: err.message });
      });
    }
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    await channel?.send(`🎉 <@${ticket.client_id}>, welcome to the build team!${roleNote}`);
    await dm(interaction.client, ticket.client_id, 'Your team application was accepted — welcome to the build team!');
    logger.info('Application accepted', { ticketId: ticket.id, by: interaction.user.id });
  } catch (err) {
    logger.error('accept_application failed', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'Accepted, but notifying the applicant failed.');
  }
}

/** reject_application:ticketId — manager opens the reason modal. */
export async function handleRejectApplication(interaction, parts) {
  const ticket = await applicationTicket(interaction, parts[1]);
  if (!ticket) return;
  if (!isManagerOrAdmin(interaction.member)) {
    await interaction.reply(ephemeral('Only a manager can reject applications.'));
    return;
  }
  if (ticket.status !== STATUS.OPEN) {
    await interaction.reply(ephemeral('This application has already been decided.'));
    return;
  }
  await interaction.showModal(buildRejectApplicationModal(ticket.id));
}

/** reject_application_modal:ticketId — status rejected, reason to the applicant. */
export async function handleRejectApplicationModal(interaction, parts) {
  const ticket = await applicationTicket(interaction, parts[1]);
  if (!ticket) return;
  // A modal is its own door: re-check for a manager.
  if (!isManagerOrAdmin(interaction.member)) {
    await interaction.reply(ephemeral('Only a manager can reject applications.'));
    return;
  }
  if (!transitionTicket(ticket.id, STATUS.REJECTED)) {
    await interaction.reply(ephemeral('This application has already been decided.'));
    return;
  }
  const reason = interaction.fields.getTextInputValue('reject_reason')?.trim() || 'No reason given.';
  try {
    await interaction.reply(ephemeral('Application rejected.'));
    const channel = await interaction.client.channels.fetch(ticket.client_channel_id).catch(() => null);
    await channel?.send(`❌ <@${ticket.client_id}>, your application was not accepted this time.\n**Reason:** ${reason}`);
    await dm(interaction.client, ticket.client_id, `Your team application was not accepted this time.\nReason: ${reason}`);
    logger.info('Application rejected', { ticketId: ticket.id, by: interaction.user.id });
  } catch (err) {
    logger.error('reject_application_modal failed', { ticketId: ticket.id, error: err.message });
    await replyError(interaction, 'Rejected, but notifying the applicant failed.');
  }
}
