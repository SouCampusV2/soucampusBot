/**
 * Handler for order_form_2:ticketId — legacy "Continue — version & details" button in tickets
 * opened before the order modal (2026-10-26). Opens Version & deadline.
 */

import { handleOrderFinish } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderForm2Button(interaction, parts) {
  await handleOrderFinish(interaction, parts);
}
