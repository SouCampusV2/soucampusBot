/**
 * Handler for order_budget:ticketId — save budget choice and show order summary embed.
 */

import { handleOrderBudgetSelect } from '../../modules/tickets/flows/OrderFlow.js';

export async function handleOrderBudget(interaction, parts) {
  await handleOrderBudgetSelect(interaction, parts);
}
