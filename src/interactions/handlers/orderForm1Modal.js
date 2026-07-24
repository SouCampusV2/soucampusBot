/**
 * Handler for order_form_1:ticketId — modal submit: save 5 fields, send Continue button.
 */

import { handleOrderForm1Modal } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderForm1ModalSubmit(interaction, parts) {
  await handleOrderForm1Modal(interaction, parts);
}
