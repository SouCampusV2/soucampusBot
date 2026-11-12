/**
 * Bridge to the website (soucampus.online), phase 4 — docs/PHASE4.md.
 *
 * The bot never touches the site's database. It POSTs signed JSON to ONE site endpoint
 * (/api/discord/bridge), which validates it and parks it in a moderation queue; the owner
 * publishes from the site's admin. Same shape as Stripe webhooks: shared secret, HMAC over
 * "<timestamp>.<raw body>", timestamp checked against replays.
 *
 * Delivery goes through an outbox table: enqueue writes a row, flushOutbox sends whatever is
 * due and retries failures with backoff. So nothing is lost while the site is down — or not
 * configured yet: without SITE_BRIDGE_URL/SECRET items simply wait.
 */

import { createHmac } from 'node:crypto';
import { get, query, run } from '../../core/Database.js';
import { getTicketFields } from '../tickets/TicketRepository.js';
import { parseSize } from '../../utils/pricing.js';
import { parsePrice } from '../tickets/Reports.js';
import { fetchAllMessages } from '../tickets/Transcript.js';
import { logger } from '../../utils/logger.js';

/** Most screenshots to offer per build (the admin picks the cover and order). */
const MAX_IMAGES = 8;
const MAX_ATTEMPTS = 12;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

/** @returns {{ url: string, secret: string }} */
export function siteConfig() {
  return { url: process.env.SITE_BRIDGE_URL ?? '', secret: process.env.SITE_BRIDGE_SECRET ?? '' };
}

/**
 * The signature the site verifies. Changing this format breaks the site side —
 * a fixed test vector guards it on both sides (tests/siteBridge.test.js).
 * @param {string} secret
 * @param {string} timestamp - unix seconds, as sent in x-bocampus-timestamp
 * @param {string} body - the exact raw JSON string sent
 */
/**
 * Servers whose orders may be sent to the website (security audit 2026-11, B-01).
 *
 * The bridge signs whatever it sends with the site's secret, so the site trusts it. Before this
 * check anyone who added the bot to a server of their own was an administrator there, could run
 * a fake order from start to finish and push a "client review" into the owner's queue — the
 * payload did not even say which server it came from.
 *
 * SITE_BRIDGE_GUILDS (comma-separated ids) wins; otherwise the home server, GUILD_ID. With neither
 * set the bridge stays open, as before — set one of them on the VPS before enabling the bridge.
 */
export function bridgeAllowsGuild(guildId, env = process.env) {
  const allowed = (env.SITE_BRIDGE_GUILDS || env.GUILD_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.length === 0 || allowed.includes(String(guildId));
}

export function signBody(secret, timestamp, body) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Queue an item for the site. Idempotent per key: the first payload wins (a double click
 * on a consent button cannot queue two drafts).
 * @param {'portfolio_draft' | 'review'} kind
 * @param {string} key - e.g. 'portfolio:<ticketId>'; the site uses it to ignore repeats too
 * @param {object} payload
 */
export function enqueue(kind, key, payload) {
  run('INSERT OR IGNORE INTO site_outbox (key, kind, payload, created_at) VALUES (?, ?, ?, ?)', [
    key,
    kind,
    JSON.stringify(payload),
    Date.now(),
  ]);
}

/** @returns {number} items not yet delivered (pending, including ones waiting for config) */
export function pendingCount() {
  return get("SELECT COUNT(*) AS n FROM site_outbox WHERE status = 'pending'")?.n ?? 0;
}

/** 4xx (except timeout/rate limit) will not fix itself by retrying. */
const isPermanent = (status) => status >= 400 && status < 500 && status !== 408 && status !== 429;

/**
 * Send everything due. Safe to call often (every cleanup sweep, right after enqueue).
 * @param {{ config?: { url: string, secret: string }, fetchFn?: typeof fetch, now?: number }} [options]
 * @returns {Promise<number>} items delivered in this run
 */
export async function flushOutbox({ config = siteConfig(), fetchFn = fetch, now = Date.now() } = {}) {
  if (!config.url || !config.secret) return 0;
  const due = query("SELECT * FROM site_outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at", [now]);
  let delivered = 0;
  for (const item of due) {
    const body = JSON.stringify({ key: item.key, kind: item.kind, payload: JSON.parse(item.payload) });
    const timestamp = String(Math.floor(now / 1000));
    let error;
    let permanent = false;
    try {
      const res = await fetchFn(config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-bocampus-timestamp': timestamp,
          'x-bocampus-signature': signBody(config.secret, timestamp, body),
        },
        body,
      });
      if (res.ok) {
        run("UPDATE site_outbox SET status = 'sent', sent_at = ?, last_error = NULL WHERE key = ?", [now, item.key]);
        delivered++;
        logger.info('Sent to website', { key: item.key });
        continue;
      }
      error = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`;
      permanent = isPermanent(res.status);
    } catch (err) {
      error = err.message;
    }
    const attempts = item.attempts + 1;
    const failed = permanent || attempts >= MAX_ATTEMPTS;
    const backoff = Math.min(2 ** attempts * 60_000, MAX_BACKOFF_MS);
    run('UPDATE site_outbox SET attempts = ?, next_attempt_at = ?, last_error = ?, status = ? WHERE key = ?', [
      attempts,
      now + backoff,
      error,
      failed ? 'failed' : 'pending',
      item.key,
    ]);
    logger[failed ? 'error' : 'warn']('Website delivery failed', { key: item.key, attempts, error, gaveUp: failed });
  }
  return delivered;
}

/**
 * What the site needs to prefill a portfolio work. The owner edits and publishes it on the
 * site; nothing here is final copy. No client name or id — the client agreed to show the
 * build, not themselves.
 * @param {import('discord.js').Client} client
 * @param {object} ticket - a completed order
 */
export async function buildPortfolioDraft(client, ticket) {
  const fields = Object.fromEntries(getTicketFields(ticket.id).map((f) => [f.field_name, f.field_value]));
  const size = parseSize(fields.size);
  const agreed = get("SELECT price FROM proposals WHERE ticket_id = ? AND status = 'accepted'", [ticket.id])?.price;
  const createdMs = Date.parse(`${(ticket.created_at ?? '').replace(' ', 'T')}Z`);
  const days =
    ticket.completed_at && Number.isFinite(createdMs)
      ? Math.max(1, Math.round((ticket.completed_at - createdMs) / 86_400_000))
      : null;

  return {
    ticketId: ticket.id,
    // Which server the order lived on: shown to the owner next to the draft.
    guildId: ticket.guild_id ?? null,
    need: fields.need ?? '',
    theme: fields.theme ?? '',
    version: fields.version ?? '',
    sizeLabel: size ? `${size.width}×${size.height}` : (fields.size ?? ''),
    sizeX: size?.width ?? null,
    sizeZ: size?.height ?? null,
    priceAmount: agreed ? parsePrice(agreed) : null,
    priceLabel: agreed ?? '',
    deadlineDays: days,
    completedAt: ticket.completed_at ?? null,
    images: await collectBuildImages(client, ticket),
  };
}

/**
 * Screenshots of the build: images posted in the order channel by the assigned freelancer,
 * newest last, at most MAX_IMAGES. Client uploads (references) are not the build.
 * Discord CDN links expire in about a day — the site copies them into its own storage on
 * receipt, which is why drafts are sent right after consent.
 */
async function collectBuildImages(client, ticket) {
  const channel = await client.channels.fetch(ticket.client_channel_id).catch(() => null);
  if (!channel || !ticket.assigned_freelancer_id) return [];
  const messages = await fetchAllMessages(channel, 1000).catch(() => []);
  const urls = messages
    .filter((m) => m.author?.id === ticket.assigned_freelancer_id)
    .flatMap((m) => [...(m.attachments?.values() ?? [])])
    .filter((a) => (a.contentType ?? '').startsWith('image/'))
    .map((a) => a.url);
  return urls.slice(-MAX_IMAGES);
}
