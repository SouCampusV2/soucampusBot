-- schema.sql

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,              -- 'order' | 'help' | 'application'
  client_id TEXT NOT NULL,
  client_channel_id TEXT,
  freelancer_channel_id TEXT,
  assigned_freelancer_id TEXT,
  deadline TEXT,
  payment_confirmed INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
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
