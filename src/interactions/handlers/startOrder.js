/**
 * Handler for start_order:ticketId — legacy "Fill order form" button in tickets opened before
 * the order modal (2026-10-26). Opens the order modal, same as Edit order.
 */

import { handleEditOrder } from './editOrder.js';

export async function handleStartOrderButton(interaction, parts) {
  await handleEditOrder(interaction, parts);
}
