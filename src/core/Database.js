/**
 * Database abstraction — SQLite via better-sqlite3.
 * Methods: query (all rows), get (single row), run (insert/update/delete).
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';
import { backfillStatus } from '../modules/tickets/TicketStatus.js';
import { parseDeadline } from '../utils/dates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let dbInstance = null;

/**
 * Initialize database: open connection and run schema if needed.
 * @param {string} dbPath - Path to SQLite file (e.g. ./database/bot.db)
 * @returns {import('better-sqlite3').Database}
 */
export function initDatabase(dbPath) {
  if (dbInstance) {
    return dbInstance;
  }
  try {
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    const schemaPath = join(__dirname, '../../database/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    dbInstance.exec(schema);
    runMigrations(dbInstance);
    logger.info('Database initialized', { path: dbPath });
    return dbInstance;
  } catch (err) {
    logger.error('Database init failed', { error: err.message });
    throw err;
  }
}

/**
 * Idempotent migrations for existing databases created before new columns were added.
 * `CREATE TABLE IF NOT EXISTS` does not add columns to already-existing tables, so we
 * add them here. Each ALTER is wrapped because SQLite throws if the column already exists.
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  const ticketColumns = db.prepare('PRAGMA table_info(tickets)').all().map((c) => c.name);
  const addTicketColumn = (name, definition) => {
    if (!ticketColumns.includes(name)) {
      db.exec(`ALTER TABLE tickets ADD COLUMN ${name} ${definition}`);
      logger.info('Migration: added column', { table: 'tickets', column: name });
    }
  };
  addTicketColumn('guild_id', 'TEXT');
  addTicketColumn('relay_client_msg_id', 'TEXT');
  addTicketColumn('relay_freelancer_msg_id', 'TEXT');
  addTicketColumn('quote_channel_due_at', 'INTEGER');
  addTicketColumn('status', 'TEXT');
  addTicketColumn('channel_delete_at', 'INTEGER');
  addTicketColumn('quote_counter_msg_id', 'TEXT');
  addTicketColumn('order_card_msg_id', 'TEXT');
  addTicketColumn('completed_at', 'INTEGER');
  addTicketColumn('stale_reminded_at', 'INTEGER');
  addTicketColumn('portfolio_consent', 'INTEGER');
  if (!ticketColumns.includes('number')) {
    addTicketColumn('number', 'INTEGER');
    // Number the tickets that already exist, per server, in the order they were opened.
    db.exec(`
      UPDATE tickets SET number = (
        SELECT COUNT(*) FROM tickets t2
        WHERE t2.guild_id IS tickets.guild_id
          AND (t2.created_at < tickets.created_at OR (t2.created_at = tickets.created_at AND t2.rowid <= tickets.rowid))
      )
    `);
  }
  const reviewColumns = db.prepare('PRAGMA table_info(reviews)').all().map((c) => c.name);
  if (!reviewColumns.includes('site_consent')) {
    db.exec('ALTER TABLE reviews ADD COLUMN site_consent INTEGER');
    logger.info('Migration: added column', { table: 'reviews', column: 'site_consent' });
  }
  // Orders completed before completed_at existed: use the creation time as a stand-in.
  db.prepare(
    "UPDATE tickets SET completed_at = CAST(strftime('%s', created_at) AS INTEGER) * 1000 WHERE completed = 1 AND completed_at IS NULL"
  ).run();

  const guildColumns = db.prepare('PRAGMA table_info(guild_config)').all().map((c) => c.name);
  for (const column of ['terms_url', 'privacy_url', 'panel_banner_url', 'category_help', 'category_applications', 'showcase_webhook_id', 'showcase_reactions']) {
    if (!guildColumns.includes(column)) {
      db.exec(`ALTER TABLE guild_config ADD COLUMN ${column} TEXT`);
      logger.info('Migration: added column', { table: 'guild_config', column });
    }
  }
  if (!guildColumns.includes('channel_showcase')) {
    db.exec('ALTER TABLE guild_config ADD COLUMN channel_showcase TEXT');
    logger.info('Migration: added column', { table: 'guild_config', column: 'channel_showcase' });
  }
  if (!guildColumns.includes('channel_log')) {
    db.exec('ALTER TABLE guild_config ADD COLUMN channel_log TEXT');
    logger.info('Migration: added column', { table: 'guild_config', column: 'channel_log' });
  }
  normalizeDeadlines(db);
  backfillStatus(db);

  // Indexes created here (after column migrations) so they can reference new columns.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_client_channel ON tickets(client_channel_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_freelancer_channel ON tickets(freelancer_channel_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_delete_at ON tickets(channel_delete_at);
    CREATE INDEX IF NOT EXISTS idx_ticket_fields_ticket ON ticket_fields(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_ticket ON proposals(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_ticket ON reviews(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_number ON tickets(guild_id, number);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages ON conversation_messages(conversation_id);
  `);
}

/**
 * tickets.deadline used to hold whatever the client typed; it now holds 'YYYY-MM-DD' or NULL.
 * Convert old rows once: relative text ("2 weeks") counts from the ticket's creation, not from
 * today. Unreadable text becomes NULL — the original stays in ticket_fields. Idempotent: rows
 * that are already a date are skipped.
 * @param {import('better-sqlite3').Database} db
 */
export function normalizeDeadlines(db) {
  const rows = db
    .prepare("SELECT id, deadline, created_at FROM tickets WHERE deadline IS NOT NULL AND deadline NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'")
    .all();
  if (!rows.length) return;
  const update = db.prepare('UPDATE tickets SET deadline = ? WHERE id = ?');
  db.transaction(() => {
    for (const row of rows) {
      const created = row.created_at ? new Date(`${row.created_at.replace(' ', 'T')}Z`) : new Date();
      update.run(parseDeadline(row.deadline, created), row.id);
    }
  })();
  logger.info('Migration: normalized ticket deadlines to dates', { tickets: rows.length });
}

/**
 * Get the current DB instance. Must call initDatabase first.
 * @returns {import('better-sqlite3').Database}
 */
export function getDatabase() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

/**
 * Run a SELECT and return all rows.
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {unknown[]}
 */
export function query(sql, params = []) {
  const db = getDatabase();
  try {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  } catch (err) {
    logger.error('Database query failed', { sql, error: err.message });
    throw err;
  }
}

/**
 * Run a SELECT and return the first row or undefined.
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {unknown | undefined}
 */
export function get(sql, params = []) {
  const db = getDatabase();
  try {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  } catch (err) {
    logger.error('Database get failed', { sql, error: err.message });
    throw err;
  }
}

/**
 * Run INSERT/UPDATE/DELETE. Returns info object with changes.
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {{ changes: number, lastInsertRowid: number }}
 */
export function run(sql, params = []) {
  const db = getDatabase();
  try {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  } catch (err) {
    logger.error('Database run failed', { sql, error: err.message });
    throw err;
  }
}
