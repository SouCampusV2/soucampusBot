/**
 * Entry point — loads env, database, bot, interaction router; starts bot.
 */

import 'dotenv/config';
import { initDatabase } from './core/Database.js';
import { getBot, startBot } from './core/Bot.js';
import { attachToClient } from './core/InteractionRouter.js';
import { registerTicketModule } from './modules/tickets/TicketModule.js';
import { logger } from './utils/logger.js';

const DB_PATH = process.env.DB_PATH || './database/bot.db';

// A forgotten .catch() somewhere must not take the whole bot down: log it and keep serving.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason instanceof Error ? reason.stack : String(reason) });
});
// After an uncaught exception the process state is unknown — log and exit, the process manager restarts it.
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — exiting', { error: err.stack });
  process.exit(1);
});

async function main() {
  try {
    initDatabase(DB_PATH);
    const client = getBot();
    attachToClient(client);
    registerTicketModule(client);
    await startBot();
  } catch (err) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }
}

main();
