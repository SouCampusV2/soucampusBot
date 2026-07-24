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
