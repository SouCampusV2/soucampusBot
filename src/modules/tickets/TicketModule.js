/**
 * Ticket module — registers all ticket-related interactions and posts panel on ready.
 * Also: messageCreate in order ticket channels → order dialog (OrderFlow).
 */

import { Events } from 'discord.js';
import { registerHandler, registerCommandHandler } from '../../core/InteractionRouter.js';
import { inviteCommandData, handleInviteCommand } from '../../commands/inviteCommand.js';
import { handleCreateTicket } from '../../interactions/handlers/createTicket.js';
import { handleSelectTicketType } from '../../interactions/handlers/selectTicketType.js';
import { handleConfirmTicket } from '../../interactions/handlers/confirmTicket.js';
import { handleStartOrderButton } from '../../interactions/handlers/startOrder.js';
import { handleOrderForm1ModalSubmit } from '../../interactions/handlers/orderForm1Modal.js';
import { handleOrderForm2Button } from '../../interactions/handlers/orderForm2.js';
import { handleOrderForm2ModalSubmit } from '../../interactions/handlers/orderForm2Modal.js';
import { handleOrderBudget } from '../../interactions/handlers/orderBudget.js';
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
import { scheduleDeadlineJob } from '../../jobs/deadlineJob.js';
import { getTicketPanelPayload } from '../../embeds/templates.js';
import { PREFIX, TICKET_TYPES } from '../../constants.js';
import { getTicketByClientChannelId } from './TicketRepository.js';
import { handleOrderChannelMessage } from './flows/OrderFlow.js';
import { logger } from '../../utils/logger.js';

/**
 * Post the ticket panel (embed + Create Ticket button) in CHANNEL_TICKET_PANEL.
 * @param {import('discord.js').Client} client
 */
async function postPanel(client) {
  const channelId = process.env.CHANNEL_TICKET_PANEL;
  if (!channelId) {
    logger.warn('CHANNEL_TICKET_PANEL not set — ticket panel not posted');
    return;
  }
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      logger.warn('Could not fetch CHANNEL_TICKET_PANEL', { channelId });
      return;
    }
    const payload = getTicketPanelPayload();
    await channel.send(payload);
    logger.info('Ticket panel posted', { channelId });
  } catch (err) {
    logger.error('Failed to post ticket panel', { error: err.message });
  }
}

/**
 * Register ticket handlers and post panel when bot is ready.
 * @param {import('discord.js').Client} client
 */
/**
 * Handle message in a channel: if it's an order ticket client channel, run order dialog.
 */
async function onMessageCreate(message) {
  if (message.author.bot) return;
  const ticket = getTicketByClientChannelId(message.channel.id);
  if (!ticket || ticket.type !== TICKET_TYPES.ORDER) return;
  try {
    await handleOrderChannelMessage(message, ticket);
  } catch (err) {
    logger.error('OrderFlow handleOrderChannelMessage failed', { error: err.message });
  }
}

export function registerTicketModule(client) {
  registerCommandHandler('invite', handleInviteCommand);
  registerHandler(PREFIX.CREATE_TICKET, handleCreateTicket);
  registerHandler(PREFIX.SELECT_TICKET_TYPE, handleSelectTicketType);
  registerHandler(PREFIX.CONFIRM_TICKET, handleConfirmTicket);
  registerHandler(PREFIX.START_ORDER, handleStartOrderButton);
  registerHandler(PREFIX.ORDER_FORM_1, handleOrderForm1ModalSubmit);
  registerHandler(PREFIX.ORDER_FORM_2, handleOrderForm2Button);
  registerHandler(PREFIX.ORDER_FORM_2_MODAL, handleOrderForm2ModalSubmit);
  registerHandler(PREFIX.ORDER_BUDGET, handleOrderBudget);
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

  client.once(Events.ClientReady, async () => {
    postPanel(client);
    scheduleDeadlineJob(client);
    const guildId = process.env.GUILD_ID;
    if (guildId) {
      try {
        await client.application.commands.create(inviteCommandData, guildId);
        logger.info('Slash command /invite registered', { guildId });
      } catch (err) {
        logger.warn('Could not register /invite command (may already exist)', { guildId, error: err.message });
      }
    }
  });
  client.on(Events.MessageCreate, onMessageCreate);
}
