/**
 * Slash command /rules — anyone can read the server rules; the card is shown only to them.
 * The public copy in the rules channel is posted by /setup rules.
 */

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getRulesPayload } from '../embeds/templates.js';

export const rulesCommandData = new SlashCommandBuilder()
  .setName('rules')
  .setDescription('Read the server rules (only you see the answer)')
  .setDMPermission(false)
  .toJSON();

export async function handleRulesCommand(interaction) {
  const payload = getRulesPayload(interaction.guildId);
  await interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
}
