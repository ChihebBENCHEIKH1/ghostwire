-- ═══════════════════════════════════════════════════════════════════════════════
--  Ghostwire — PostgreSQL Initialisation Script
--  Runs once when the postgres container starts for the first time.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL        PRIMARY KEY,
  username      VARCHAR(64)   NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          VARCHAR(32)   NOT NULL DEFAULT 'viewer',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Deployments ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deployments (
  id            SERIAL        PRIMARY KEY,
  schema        JSONB         NOT NULL,
  deployed_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deployed_by   VARCHAR(64),
  status        VARCHAR(32)   NOT NULL DEFAULT 'active',
  notes         TEXT
);

-- ── Pipeline hits ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hits (
  id            SERIAL        PRIMARY KEY,
  deployment_id INTEGER       REFERENCES deployments(id) ON DELETE SET NULL,
  payload       JSONB,
  latency_ms    INTEGER,
  status        VARCHAR(32)   NOT NULL DEFAULT 'success',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hits_deployment_id_idx ON hits(deployment_id);
CREATE INDEX IF NOT EXISTS hits_created_at_idx    ON hits(created_at DESC);

-- ── Node error log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS node_errors (
  id            SERIAL        PRIMARY KEY,
  deployment_id INTEGER       REFERENCES deployments(id) ON DELETE SET NULL,
  node_id       VARCHAR(128)  NOT NULL,
  error_message TEXT          NOT NULL,
  occurred_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS node_errors_node_id_idx ON node_errors(node_id);

-- ── Seed default admin user (password: admin — CHANGE IN PRODUCTION) ──────────

INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2b$10$placeholder_change_me_in_production', 'admin')
ON CONFLICT (username) DO NOTHING;
