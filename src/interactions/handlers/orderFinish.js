/**
 * Handler for order_finish:ticketId — Version & deadline button on the summary card.
 */

import { handleOrderFinish } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderFinishButton(interaction, parts) {
  await handleOrderFinish(interaction, parts);
}
