/**
 * Handler for order_form_2:ticketId — show Order form part 2 modal (version, extra_details).
 */

import { handleOrderForm2 } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderForm2Button(interaction, parts) {
  await handleOrderForm2(interaction, parts);
}
