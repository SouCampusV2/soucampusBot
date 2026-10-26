-- schema.sql

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,              -- 'order' | 'help' | 'application'
  status TEXT,                     -- lifecycle stage, see src/modules/tickets/TicketStatus.js
  guild_id TEXT,
  client_id TEXT NOT NULL,
  client_channel_id TEXT,
  freelancer_channel_id TEXT,
  assigned_freelancer_id TEXT,
  deadline TEXT,
  payment_confirmed INTEGER DEFAULT 0,  -- legacy, derived from status; written, never read
  completed INTEGER DEFAULT 0,          -- legacy, derived from status; written, never read
  number INTEGER,                  -- per-server ticket number shown to people (#1, #2, …); id stays the key
  relay_client_msg_id TEXT,        -- legacy (2026-10-26, replaced by conversations), unused
  relay_freelancer_msg_id TEXT,    -- legacy, unused
  quote_channel_due_at INTEGER,    -- epoch ms: when quote channel should be created (STEP 4), NULL once done
  channel_delete_at INTEGER,       -- epoch ms: when the closed ticket's channel is deleted, NULL = keep
  quote_counter_msg_id TEXT,       -- legacy (2026-10-26, replaced by the order card), unused
  order_card_msg_id TEXT,          -- the order card in the client channel, edited on every change
  completed_at INTEGER,            -- epoch ms when the order was marked complete (freelancer stats)
  stale_reminded_at INTEGER,       -- epoch ms of the "your form is not finished" reminder (hygiene)
  portfolio_consent INTEGER,       -- client allowed showing the build on the website: 1 yes, 0 no, NULL not asked/answered
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_fields (
  ticket_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  freelancer_id TEXT NOT NULL,
  price TEXT,
  deadline TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',   -- 'pending' | 'accepted' | 'declined'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  freelancer_id TEXT NOT NULL,
  rating INTEGER,
  comment TEXT,
  site_consent INTEGER,            -- client allowed showing the review on the website: 1 / 0 / NULL
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT,
  actor_id TEXT,
  action TEXT,
  detail TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Outbox to the website (phase 4): signed POSTs to /api/discord/bridge, retried until sent.
-- key is the idempotency key (e.g. 'portfolio:<ticketId>'), also sent to the site.
CREATE TABLE IF NOT EXISTS site_outbox (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,              -- 'portfolio_draft' | 'review'
  payload TEXT NOT NULL,           -- JSON
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);

-- A builder's questions to the client before quoting (Send Message), one per order and builder.
-- Shown as ONE card in the client channel and its copy in the quote channel, edited on every message.
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  freelancer_id TEXT NOT NULL,
  client_msg_id TEXT,              -- the card in the client channel
  quote_msg_id TEXT,               -- its copy in the quote channel
  thread_id TEXT,                  -- private thread (client + builder) once opened
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ticket_id, freelancer_id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT,                -- display name when written (no member lookups to draw the card)
  author_role TEXT NOT NULL,       -- 'builder' | 'client' | 'team'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,     -- epoch ms
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Per-server (guild) configuration. Set via the /setup slash command.
-- Any value left NULL falls back to the matching .env variable (single-server mode).
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  category_active_orders TEXT,
  category_quotes TEXT,
  category_archived TEXT,
  category_help TEXT,
  category_applications TEXT,
  channel_panel TEXT,
  channel_reviews TEXT,
  role_manager TEXT,
  role_freelancer TEXT,
  brand_color TEXT,
  channel_log TEXT,
  channel_showcase TEXT,
  showcase_webhook_id TEXT,
  showcase_reactions TEXT,
  terms_url TEXT,
  privacy_url TEXT,
  panel_banner_url TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes are created in code (Database.js runMigrations) AFTER column migrations,
-- so they can safely reference columns added to pre-existing tables.
