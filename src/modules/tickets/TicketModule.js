/**
 * Ticket module — registers all ticket-related interactions and commands; startup jobs on ready.
 */

import { Events } from 'discord.js';
import { registerHandler, registerCommandHandler } from '../../core/InteractionRouter.js';
import { inviteCommandData, handleInviteCommand } from '../../commands/inviteCommand.js';
import { ordersCommandData, handleOrdersCommand } from '../../commands/ordersCommand.js';
import { statsCommandData, handleStatsCommand } from '../../commands/statsCommand.js';
import { setupCommandData, handleSetupCommand } from '../../commands/setupCommand.js';
import { rulesCommandData, handleRulesCommand } from '../../commands/rulesCommand.js';
import { handleCreateTicket } from '../../interactions/handlers/createTicket.js';
import { handleSelectTicketType } from '../../interactions/handlers/selectTicketType.js';
import { handleConfirmTicket } from '../../interactions/handlers/confirmTicket.js';
import { handleStartOrderButton } from '../../interactions/handlers/startOrder.js';
import { handleOrderNewModalSubmit } from '../../interactions/handlers/orderNewModal.js';
import { handleOrderFinishButton } from '../../interactions/handlers/orderFinish.js';
import { handleOrderFinishModalSubmit } from '../../interactions/handlers/orderFinishModal.js';
import { handleOrderForm2Button } from '../../interactions/handlers/orderForm2.js';
import { handleEditOrder } from '../../interactions/handlers/editOrder.js';
import { handleEditOrderModal } from '../../interactions/handlers/editOrderModal.js';
import { handleSubmitQuote } from '../../interactions/handlers/submitQuote.js';
import { handleSubmitQuoteModal } from '../../interactions/handlers/submitQuoteModal.js';
import { handleSelectFreelancer } from '../../interactions/handlers/selectFreelancer.js';
import { handleContactFreelancer } from '../../interactions/handlers/contactFreelancer.js';
import { handleCloseDiscussion } from '../../interactions/handlers/closeDiscussion.js';
import { handleDeclineQuote } from '../../interactions/handlers/declineQuote.js';
import { handleSendMessage } from '../../interactions/handlers/sendMessage.js';
import { handleSendMessageModal } from '../../interactions/handlers/sendMessageModal.js';
import { handleReplyRelay } from '../../interactions/handlers/replyRelay.js';
import { handleReplyRelayModal } from '../../interactions/handlers/replyRelayModal.js';
import { handleDeclineOrder } from '../../interactions/handlers/declineOrder.js';
import { handleConfirmPayment } from '../../interactions/handlers/confirmPayment.js';
import { handleExtendDeadline } from '../../interactions/handlers/extendDeadline.js';
import { handleExtendDeadlineModal } from '../../interactions/handlers/extendDeadlineModal.js';
import { handleMarkComplete } from '../../interactions/handlers/markComplete.js';
import { handleSubmitReview } from '../../interactions/handlers/submitReview.js';
import { handleSubmitReviewModal } from '../../interactions/handlers/submitReviewModal.js';
import { handleCloseTicket } from '../../interactions/handlers/closeTicket.js';
import { handleKeepChannel } from '../../interactions/handlers/keepChannel.js';
import {
  handleStartApplication,
  handleApplicationModal,
  handleAcceptApplication,
  handleRejectApplication,
  handleRejectApplicationModal,
} from './flows/ApplicationFlow.js';
import { scheduleDeadlineJob } from '../../jobs/deadlineJob.js';
import { scheduleCleanupJob } from '../../jobs/cleanupJob.js';
import { scheduleBackupJob } from '../../jobs/backupJob.js';
import { attachOrderCard } from './OrderCard.js';
import { attachStaffLog } from './StaffLog.js';
import { attachTranscripts } from './Transcript.js';
import { handleSiteConsent } from '../site/consent.js';
import { attachShowcaseReactions } from '../site/showcaseReactions.js';
import { ensurePanel } from '../../utils/panel.js';
import { PREFIX } from '../../constants.js';
import { recoverPendingQuoteChannels, handleSubmitOrder } from './flows/OrderFlow.js';
import { logger } from '../../utils/logger.js';

/**
 * Legacy single-server mode: make sure the panel exists in CHANNEL_TICKET_PANEL from .env.
 * Servers configured with /setup panel already have their panel — it is a persistent message,
 * so nothing is posted for them on startup.
 * @param {import('discord.js').Client} client
 */
async function postLegacyPanel(client) {
  const channelId = process.env.CHANNEL_TICKET_PANEL;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      logger.warn('Could not fetch CHANNEL_TICKET_PANEL', { channelId });
      return;
    }
    const posted = await ensurePanel(channel, client.user.id);
    logger.info(posted ? 'Ticket panel posted' : 'Ticket panel already present', { channelId });
  } catch (err) {
    logger.error('Failed to post ticket panel', { error: err.message });
  }
}

/**
 * Register the bot's slash commands. Uses the dev guild (GUILD_ID) for instant updates
 * if set, otherwise registers globally (may take up to ~1h to propagate).
 * @param {import('discord.js').Client} client
 */
async function registerSlashCommands(client) {
  const commands = [inviteCommandData, setupCommandData, ordersCommandData, statsCommandData, rulesCommandData];
  const guildId = process.env.GUILD_ID;
  try {
    if (guildId) {
      await client.application.commands.set(commands, guildId);
      logger.info('Slash commands registered (guild)', { guildId, count: commands.length });
    } else {
      await client.application.commands.set(commands);
      logger.info('Slash commands registered (global)', { count: commands.length });
    }
  } catch (err) {
    logger.warn('Could not register slash commands', { error: err.message });
  }
}

/**
 * Register ticket handlers and post panel when bot is ready.
 * @param {import('discord.js').Client} client
 */
export function registerTicketModule(client) {
  registerCommandHandler('invite', handleInviteCommand);
  registerCommandHandler('setup', handleSetupCommand);
  registerCommandHandler('orders', handleOrdersCommand);
  registerCommandHandler('stats', handleStatsCommand);
  registerCommandHandler('rules', handleRulesCommand);
  registerHandler(PREFIX.CREATE_TICKET, handleCreateTicket);
  registerHandler(PREFIX.SELECT_TICKET_TYPE, handleSelectTicketType);
  registerHandler(PREFIX.CONFIRM_TICKET, handleConfirmTicket);
  registerHandler(PREFIX.ORDER_NEW_MODAL, handleOrderNewModalSubmit);
  registerHandler(PREFIX.ORDER_FINISH, handleOrderFinishButton);
  registerHandler(PREFIX.ORDER_FINISH_MODAL, handleOrderFinishModalSubmit);
  registerHandler(PREFIX.START_ORDER, handleStartOrderButton);
  registerHandler(PREFIX.ORDER_FORM_2, handleOrderForm2Button);
  registerHandler(PREFIX.SUBMIT_ORDER, handleSubmitOrder);
  registerHandler(PREFIX.EDIT_ORDER, handleEditOrder);
  registerHandler(PREFIX.EDIT_ORDER_MODAL, handleEditOrderModal);
  registerHandler(PREFIX.SUBMIT_QUOTE, handleSubmitQuote);
  registerHandler(PREFIX.SUBMIT_QUOTE_MODAL, handleSubmitQuoteModal);
  registerHandler(PREFIX.SELECT_FREELANCER, handleSelectFreelancer);
  registerHandler(PREFIX.CONTACT_FREELANCER, handleContactFreelancer);
  registerHandler(PREFIX.CLOSE_DISCUSSION, handleCloseDiscussion);
  registerHandler(PREFIX.DECLINE_QUOTE, handleDeclineQuote);
  registerHandler(PREFIX.SEND_MESSAGE, handleSendMessage);
  registerHandler(PREFIX.SEND_MESSAGE_MODAL, handleSendMessageModal);
  registerHandler(PREFIX.REPLY_RELAY, handleReplyRelay);
  registerHandler(PREFIX.REPLY_RELAY_MODAL, handleReplyRelayModal);
  registerHandler(PREFIX.DECLINE_ORDER, handleDeclineOrder);
  registerHandler(PREFIX.CONFIRM_PAYMENT, handleConfirmPayment);
  registerHandler(PREFIX.EXTEND_DEADLINE, handleExtendDeadline);
  registerHandler(PREFIX.EXTEND_DEADLINE_MODAL, handleExtendDeadlineModal);
  registerHandler(PREFIX.MARK_COMPLETE, handleMarkComplete);
  registerHandler(PREFIX.SUBMIT_REVIEW, handleSubmitReview);
  registerHandler(PREFIX.SUBMIT_REVIEW_MODAL, handleSubmitReviewModal);
  registerHandler(PREFIX.CLOSE_TICKET, handleCloseTicket);
  registerHandler(PREFIX.SITE_CONSENT, handleSiteConsent);
  registerHandler(PREFIX.KEEP_CHANNEL, handleKeepChannel);
  registerHandler(PREFIX.START_APPLICATION, handleStartApplication);
  registerHandler(PREFIX.APPLICATION_MODAL, handleApplicationModal);
  registerHandler(PREFIX.ACCEPT_APPLICATION, handleAcceptApplication);
  registerHandler(PREFIX.REJECT_APPLICATION, handleRejectApplication);
  registerHandler(PREFIX.REJECT_APPLICATION_MODAL, handleRejectApplicationModal);

  // Event-driven features: subscribed once, react to every ticket change from any handler.
  attachOrderCard(client);
  attachStaffLog(client);
  attachTranscripts(client);
  attachShowcaseReactions(client);

  client.once(Events.ClientReady, async () => {
    postLegacyPanel(client);
    scheduleDeadlineJob(client);
    scheduleCleanupJob(client);
    scheduleBackupJob();
    recoverPendingQuoteChannels(client);
    await registerSlashCommands(client);
  });
}
