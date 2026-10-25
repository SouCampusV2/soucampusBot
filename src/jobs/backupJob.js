/**
 * Daily SQLite backup, made by the bot itself (no host cron, no root on the VPS needed).
 * Uses better-sqlite3's online backup API — a consistent copy even while the bot writes,
 * unlike copying the file under WAL mode. Keeps the newest BACKUP_KEEP files.
 */

import cron from 'node-cron';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '../core/Database.js';
import { BOT_TIMEZONE } from './deadlineJob.js';
import { todayIso } from '../utils/dates.js';
import { logger } from '../utils/logger.js';

const BACKUP_KEEP = 14;
const BACKUP_FILE = /^bot-\d{4}-\d{2}-\d{2}\.db$/;

/**
 * Write today's backup into `dir` and delete the oldest beyond `keep`.
 * @param {string} dir
 * @param {{ keep?: number, now?: Date }} [options]
 * @returns {Promise<string>} path of the backup written
 */
export async function backupDatabase(dir, { keep = BACKUP_KEEP, now = new Date() } = {}) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `bot-${todayIso(now)}.db`);
  await getDatabase().backup(file);
  // ISO dates sort as strings, so the oldest come first.
  const backups = readdirSync(dir).filter((f) => BACKUP_FILE.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    unlinkSync(join(dir, old));
  }
  return file;
}

/**
 * Daily at 04:00 bot time. Off unless BACKUP_DIR is set (it is in docker-compose.yml),
 * so a local `npm start` does not litter backups.
 */
export function scheduleBackupJob() {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return;
  cron.schedule(
    '0 4 * * *',
    () =>
      backupDatabase(dir)
        .then((file) => logger.info('Database backup written', { file }))
        .catch((err) => logger.error('Database backup failed', { error: err.message })),
    { timezone: BOT_TIMEZONE, name: 'db-backup' }
  );
  logger.info('Backup job scheduled', { at: '04:00', timezone: BOT_TIMEZONE, dir, keep: BACKUP_KEEP });
}
