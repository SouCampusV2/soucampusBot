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
    const schemaPath = join(__dirname, '../../database/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    dbInstance.exec(schema);
    logger.info('Database initialized', { path: dbPath });
    return dbInstance;
  } catch (err) {
    logger.error('Database init failed', { error: err.message });
    throw err;
  }
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
