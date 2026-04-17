-- Migration 5: bot_instances
-- Auto-extracted from dbMigrate.js

CREATE TABLE IF NOT EXISTS bot_instances (
        instance_id     UUID PRIMARY KEY,
        version         TEXT NOT NULL DEFAULT '',
        git_sha         TEXT NOT NULL DEFAULT '',
        pid             INTEGER,
        hostname        TEXT NOT NULL DEFAULT '',
        started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        shutdown_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_bot_instances_started_at ON bot_instances(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bot_instances_heartbeat ON bot_instances(last_heartbeat DESC);
