/**
 * Handler for create_ticket — show Select Menu (Help / Team Application / Order).
 */

import { MessageFlags } from 'discord.js';
import { selectTicketTypeRow } from '../../embeds/templates.js';

export async function handleCreateTicket(interaction) {
  await interaction.reply({
    content: 'Choose the type of ticket:',
    components: [selectTicketTypeRow()],
    flags: MessageFlags.Ephemeral,
  });
}
