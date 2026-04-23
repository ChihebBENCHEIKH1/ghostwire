'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pipeline.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS hits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT    NOT NULL,
    event_name  TEXT,
    payload     TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'processing',
    latency_ms  INTEGER,
    api_key_id  TEXT,
    is_replay   INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_hits_received ON hits (received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hits_status   ON hits (status);

  CREATE TABLE IF NOT EXISTS node_configs (
    node_id    TEXT PRIMARY KEY,
    config     TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL DEFAULT 'default',
    schema_json TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'draft',
    deployed_at TEXT,
    created_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user',
    created_at    TEXT    NOT NULL
  );
`);

// ── Prepared statements ────────────────────────────────────────────────────
const stmts = {
  insertHit: db.prepare(`
    INSERT INTO hits (received_at, event_name, payload, status, api_key_id, is_replay)
    VALUES (?, ?, ?, 'processing', ?, ?)
  `),
  updateHit:  db.prepare(`UPDATE hits SET status = ?, latency_ms = ? WHERE id = ?`),
  getHit:     db.prepare(`SELECT * FROM hits WHERE id = ?`),
  listHits:   db.prepare(`SELECT * FROM hits ORDER BY id DESC LIMIT ? OFFSET ?`),
  listHitsFiltered: db.prepare(`
    SELECT * FROM hits
    WHERE (:status IS NULL OR status = :status)
      AND (:event  IS NULL OR event_name = :event)
      AND (:since  IS NULL OR received_at >= :since)
    ORDER BY id DESC LIMIT :limit OFFSET :offset
  `),
  countHitsFiltered: db.prepare(`
    SELECT COUNT(*) as count FROM hits
    WHERE (:status IS NULL OR status = :status)
      AND (:event  IS NULL OR event_name = :event)
      AND (:since  IS NULL OR received_at >= :since)
  `),
  countHits:  db.prepare(`SELECT COUNT(*) as count FROM hits`),
  analytics:  db.prepare(`
    SELECT
      COUNT(*)                                                          AS total_hits,
      SUM(CASE WHEN status = 'success'    THEN 1 ELSE 0 END)           AS success_count,
      ROUND(AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END)) AS avg_latency
    FROM hits
  `),
  topFailingNodes: db.prepare(`
    SELECT event_name, COUNT(*) as fail_count
    FROM hits WHERE status = 'error' AND event_name IS NOT NULL
    GROUP BY event_name ORDER BY fail_count DESC LIMIT 5
  `),
  getConfig:    db.prepare(`SELECT config, updated_at FROM node_configs WHERE node_id = ?`),
  upsertConfig: db.prepare(`
    INSERT INTO node_configs (node_id, config, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(node_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at
  `),

  // Deployment statements
  getActiveDeployment: db.prepare(`
    SELECT * FROM deployments WHERE status = 'deployed' ORDER BY id DESC LIMIT 1
  `),
  getLatestDeployment: db.prepare(`
    SELECT * FROM deployments ORDER BY id DESC LIMIT 1
  `),
  getLatestDraft: db.prepare(`
    SELECT * FROM deployments WHERE status = 'draft' ORDER BY id DESC LIMIT 1
  `),
  insertDeployment: db.prepare(`
    INSERT INTO deployments (name, schema_json, status, created_at) VALUES (?, ?, ?, ?)
  `),
  updateDeploymentSchema: db.prepare(`
    UPDATE deployments SET schema_json = ?, created_at = ? WHERE id = ?
  `),
  archiveDeployed: db.prepare(`
    UPDATE deployments SET status = 'archived' WHERE status = 'deployed'
  `),
  promoteToDeployed: db.prepare(`
    UPDATE deployments SET status = 'deployed', deployed_at = ? WHERE id = ?
  `),

  // User auth statements
  createUser:         db.prepare(`INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'user', ?)`),
  findUserByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  findUserById:       db.prepare(`SELECT id, username, role, created_at FROM users WHERE id = ?`),
  countUsers:         db.prepare(`SELECT COUNT(*) as count FROM users`),
};

module.exports = { db, stmts };
