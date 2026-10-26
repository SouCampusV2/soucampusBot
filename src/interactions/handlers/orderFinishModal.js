/**
 * Handler for order_finish_modal:ticketId — Version & deadline modal submit.
 */

import { handleOrderFinishModal } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderFinishModalSubmit(interaction, parts) {
  await handleOrderFinishModal(interaction, parts);
}
