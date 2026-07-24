/**
 * Handler for order_form_2_modal:ticketId — modal submit: save version + extra_details, send budget select in channel.
 */

import { handleOrderForm2Modal } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderForm2ModalSubmit(interaction, parts) {
  await handleOrderForm2Modal(interaction, parts);
}
