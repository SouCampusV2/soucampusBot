import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { seedOrder } from './helpers/db.js';
import { backupDatabase } from '../src/jobs/backupJob.js';

test('a backup is a readable copy with the data in it', async () => {
  const ticketId = seedOrder({ guildId: 'g-backup', clientId: 'c', clientChannelId: 'ch-backup' });
  const dir = mkdtempSync(join(tmpdir(), 'bocampus-backup-'));
  const file = await backupDatabase(dir, { now: new Date('2026-10-26T04:00:00Z') });
  assert.match(file, /bot-2026-10-26\.db$/);
  const copy = new Database(file, { readonly: true });
  assert.equal(copy.prepare('SELECT id FROM tickets WHERE id = ?').get(ticketId)?.id, ticketId);
  copy.close();
});

test('only the newest N backups are kept, other files are left alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bocampus-backup-'));
  for (const day of ['01', '02', '03']) writeFileSync(join(dir, `bot-2026-10-${day}.db`), '');
  writeFileSync(join(dir, 'notes.txt'), 'keep me');
  await backupDatabase(dir, { keep: 2, now: new Date('2026-10-04T04:00:00Z') });
  assert.deepEqual(readdirSync(dir).sort(), ['bot-2026-10-03.db', 'bot-2026-10-04.db', 'notes.txt']);
});
