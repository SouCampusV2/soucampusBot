/**
 * Handler for order_new — the order modal from the panel; its submit creates the order ticket.
 */

import { handleNewOrderModal } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderNewModalSubmit(interaction) {
  await handleNewOrderModal(interaction);
}
