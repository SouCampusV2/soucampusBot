/**
 * Routes all interactions by customId prefix (e.g. quote:ticketId -> submitQuote handler).
 * Add one handler file per prefix; no other changes needed.
 */

import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

// Map: prefix (e.g. 'confirm_ticket') -> async handler(interaction, parts)
const handlers = new Map();
const commandHandlers = new Map();

/**
 * Register a handler for a customId prefix.
 * @param {string} prefix - e.g. 'confirm_ticket', 'submit_quote'
 * @param {(interaction: import('discord.js').Interaction, parts: string[]) => Promise<void>} handler
 */
export function registerHandler(prefix, handler) {
  handlers.set(prefix, handler);
}

/**
 * Register a handler for a slash command name.
 * @param {string} commandName - e.g. 'invite'
 * @param {(interaction: import('discord.js').ChatInputCommandInteraction) => Promise<void>} handler
 */
export function registerCommandHandler(commandName, handler) {
  commandHandlers.set(commandName, handler);
}

/**
 * Get the prefix from customId (first segment before ':').
 * @param {string} customId
 * @returns {string}
 */
function getPrefix(customId) {
  if (!customId || typeof customId !== 'string') return '';
  const idx = customId.indexOf(':');
  return idx === -1 ? customId : customId.slice(0, idx);
}

/**
 * Parse customId into parts (prefix:part1:part2 -> [prefix, part1, part2]).
 * @param {string} customId
 * @returns {string[]}
 */
function parseCustomId(customId) {
  if (!customId || typeof customId !== 'string') return [];
  return customId.split(':');
}

/**
 * Attach interactionCreate listener to the client and route to registered handlers.
 * @param {import('discord.js').Client} client
 */
export function attachToClient(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const handler = commandHandlers.get(interaction.commandName);
      if (handler) {
        try {
          await handler(interaction);
        } catch (err) {
          logger.error('Slash command handler error', { commandName: interaction.commandName, error: err.message });
          try {
            const reply = { content: 'Something went wrong.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(reply).catch(() => {});
            } else {
              await interaction.reply(reply).catch(() => {});
            }
          } catch (_) {}
        }
        return;
      }
    }

    const customId = interaction.customId ?? '';
    if (!customId) return;

    const prefix = getPrefix(customId);
    const handler = handlers.get(prefix);
    if (!handler) {
      logger.debug('No handler for customId prefix', { prefix, customId });
      return;
    }
    const parts = parseCustomId(customId);
    try {
      await handler(interaction, parts);
    } catch (err) {
      logger.error('Interaction handler error', {
        prefix,
        customId,
        error: err.message,
      });
      try {
        const reply = { content: 'Something went wrong.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      } catch (_) {}
    }
  });
}
