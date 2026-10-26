/**
 * Per-server (guild) configuration, stored in the guild_config table and set via /setup.
 *
 * Resolution order for any setting:
 *   1. value saved for this guild in guild_config
 *   2. fallback to the matching .env variable (single-server / legacy mode)
 *   3. null
 *
 * This lets the bot be added to many servers (each configured in-Discord) while still
 * working from .env alone on a single server.
 */

import { get, run } from './Database.js';
import { logger } from '../utils/logger.js';

/** Setting key -> { column in guild_config, .env fallback var name }. */
export const SETTINGS = {
  category_active_orders: { column: 'category_active_orders', env: 'CATEGORY_ACTIVE_ORDERS' },
  category_quotes: { column: 'category_quotes', env: 'CATEGORY_QUOTES' },
  category_archived: { column: 'category_archived', env: 'CATEGORY_ARCHIVED' },
  category_help: { column: 'category_help', env: 'CATEGORY_HELP' },
  category_applications: { column: 'category_applications', env: 'CATEGORY_APPLICATIONS' },
  channel_panel: { column: 'channel_panel', env: 'CHANNEL_TICKET_PANEL' },
  channel_reviews: { column: 'channel_reviews', env: 'CHANNEL_REVIEWS' },
  role_manager: { column: 'role_manager', env: 'ROLE_MANAGER_ID' },
  role_freelancer: { column: 'role_freelancer', env: 'ROLE_FREELANCER_ID' },
  brand_color: { column: 'brand_color', env: 'BRAND_COLOR' },
  channel_log: { column: 'channel_log', env: 'CHANNEL_LOG' },
  channel_showcase: { column: 'channel_showcase', env: 'CHANNEL_SHOWCASE' },
  showcase_webhook_id: { column: 'showcase_webhook_id', env: null },
  showcase_reactions: { column: 'showcase_reactions', env: 'SHOWCASE_REACTIONS' },
  terms_url: { column: 'terms_url', env: 'TERMS_URL' },
  privacy_url: { column: 'privacy_url', env: 'PRIVACY_URL' },
  panel_banner_url: { column: 'panel_banner_url', env: 'PANEL_BANNER_URL' },
  category_staff: { column: 'category_staff', env: null },
  channel_staff_announcements: { column: 'channel_staff_announcements', env: null },
  channel_staff_chat: { column: 'channel_staff_chat', env: null },
};

/** In-memory cache: guildId -> config row. Invalidated on write. */
const cache = new Map();

/**
 * Load the raw guild_config row for a guild (cached).
 * @param {string} guildId
 * @returns {Record<string, string|null>}
 */
export function getGuildConfig(guildId) {
  if (!guildId) return {};
  if (cache.has(guildId)) return cache.get(guildId);
  const row = get('SELECT * FROM guild_config WHERE guild_id = ?', [guildId]) || {};
  cache.set(guildId, row);
  return row;
}

/**
 * Resolve a single setting: guild value first, then .env fallback.
 * @param {string} guildId
 * @param {keyof typeof SETTINGS} key
 * @returns {string | null}
 */
export function getSetting(guildId, key) {
  const meta = SETTINGS[key];
  if (!meta) throw new Error(`Unknown setting: ${key}`);
  const row = getGuildConfig(guildId);
  const dbValue = row[meta.column];
  if (dbValue != null && dbValue !== '') return dbValue;
  const envValue = meta.env ? process.env[meta.env] : undefined;
  return envValue != null && envValue !== '' ? envValue : null;
}

/**
 * Persist a single setting for a guild (upsert) and invalidate the cache.
 * @param {string} guildId
 * @param {keyof typeof SETTINGS} key
 * @param {string} value
 */
export function setSetting(guildId, key, value) {
  const meta = SETTINGS[key];
  if (!meta) throw new Error(`Unknown setting: ${key}`);
  run(
    `INSERT INTO guild_config (guild_id, ${meta.column}, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(guild_id) DO UPDATE SET ${meta.column} = excluded.${meta.column}, updated_at = CURRENT_TIMESTAMP`,
    [guildId, value]
  );
  cache.delete(guildId);
  logger.info('Guild setting updated', { guildId, key });
}
