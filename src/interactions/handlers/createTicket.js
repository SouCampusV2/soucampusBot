/**
 * Handler for create_ticket[:type].
 *   create_ticket:<type> — a button on the V2 panel: open that ticket type straight away.
 *   create_ticket        — the old one-button panel: show the type menu (still works).
 */

import { MessageFlags } from 'discord.js';
import { selectTicketTypeRow } from '../../embeds/templates.js';
import { handleConfirmTicket } from './confirmTicket.js';
import { TICKET_TYPES } from '../../constants.js';

export async function handleCreateTicket(interaction, parts = []) {
  const type = parts[1];
  if (Object.values(TICKET_TYPES).includes(type)) {
    // fresh: the click came from the public panel — answer with a new ephemeral message,
    // never by editing the panel itself.
    await handleConfirmTicket(interaction, ['confirm_ticket', type], { fresh: true });
    return;
  }
  await interaction.reply({
    content: 'Choose the type of ticket:',
    components: [selectTicketTypeRow()],
    flags: MessageFlags.Ephemeral,
  });
}
