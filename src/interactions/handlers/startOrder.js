/**
 * Handler for start_order:ticketId — show Order form part 1 modal.
 */

import { handleStartOrder } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleStartOrderButton(interaction, parts) {
  await handleStartOrder(interaction, parts);
}
