import Database from "better-sqlite3";

export type { Database };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gateways (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  host       TEXT    NOT NULL,
  port       INTEGER NOT NULL DEFAULT 18789,
  token      TEXT    NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  last_seen  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_status (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  service    TEXT    NOT NULL,
  status     TEXT    NOT NULL,
  value      TEXT,
  detail     TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  config     TEXT    NOT NULL DEFAULT '{}',
  enabled    INTEGER NOT NULL DEFAULT 1,
  status     TEXT    NOT NULL DEFAULT 'unknown',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  agent_id   TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'active',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at   DATETIME
);

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id       INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  agent_session_id INTEGER REFERENCES agent_sessions(id) ON DELETE SET NULL,
  direction        TEXT    NOT NULL,
  content          TEXT    NOT NULL,
  sent_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

PRAGMA foreign_keys = ON;
`;

// Registry of open connections keyed by resolved path.
// Ensures a single handle per file so callers that open the same path
// twice without closing in between share one connection (idempotent open).
const openConnections = new Map<string, InstanceType<typeof Database>>();

export function initDb(path: string): InstanceType<typeof Database> {
  const existing = openConnections.get(path);
  if (existing && existing.open) {
    return existing;
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  openConnections.set(path, db);
  return db;
}

export function closeDb(db: InstanceType<typeof Database>): void {
  // Remove from registry before closing so the path becomes available again
  for (const [path, conn] of openConnections.entries()) {
    if (conn === db) {
      openConnections.delete(path);
      break;
    }
  }
  if (db.open) db.close();
}
