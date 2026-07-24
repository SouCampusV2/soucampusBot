/**
 * Database abstraction — SQLite via better-sqlite3.
 * Methods: query (all rows), get (single row), run (insert/update/delete).
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

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

  // Indexes created here (after column migrations) so they can reference new columns.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_client_channel ON tickets(client_channel_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_freelancer_channel ON tickets(freelancer_channel_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_fields_ticket ON ticket_fields(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_ticket ON proposals(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_ticket ON reviews(ticket_id);
  `);
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
