/**
 * Handler for select_ticket_type — show Confirm button with selected type.
 */

import { confirmTicketButtonRow } from '../../embeds/templates.js';
import { TICKET_TYPES } from '../../constants.js';

const TYPE_LABELS = {
  [TICKET_TYPES.ORDER]: 'Order',
  [TICKET_TYPES.HELP]: 'Help',
  [TICKET_TYPES.APPLICATION]: 'Team Application',
};

export async function handleSelectTicketType(interaction, parts) {
  const type = interaction.values?.[0] || parts[1];
  if (!type || !Object.values(TICKET_TYPES).includes(type)) {
    await interaction.reply({ content: 'Invalid ticket type.', ephemeral: true });
    return;
  }
  const label = TYPE_LABELS[type];
  await interaction.update({
    content: `You selected **${label}**. Click below to confirm and create your ticket.`,
    components: [confirmTicketButtonRow(type)],
  });
}
