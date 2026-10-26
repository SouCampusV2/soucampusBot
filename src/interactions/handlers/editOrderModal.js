/**
 * Handler for edit_order_modal:ticketId — the order modal from Edit order: save, add the new
 * reference files, redraw the summary card, tell the freelancers if the order is already out.
 */

import { handleEditOrderModal as handleEdit } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleEditOrderModal(interaction, parts) {
  await handleEdit(interaction, parts);
}
