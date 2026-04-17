-- Migration 9: sticky_messages
-- Auto-extracted from dbMigrate.js

CREATE TABLE IF NOT EXISTS sticky_messages (
        id                   SERIAL PRIMARY KEY,
        channel_id           TEXT NOT NULL,
        source_key           TEXT NOT NULL,
        mode                 TEXT NOT NULL DEFAULT 'update' CHECK (mode IN ('update', 'repost')),
        payload              JSONB NOT NULL DEFAULT '{}',
        threshold_msgs       INTEGER NOT NULL DEFAULT 0,
        threshold_minutes    INTEGER NOT NULL DEFAULT 0,
        last_message_id      TEXT,
        msgs_since_post      INTEGER NOT NULL DEFAULT 0,
        last_posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by           TEXT NOT NULL,
        active               BOOLEAN NOT NULL DEFAULT TRUE,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(channel_id, source_key)
      );
      CREATE INDEX IF NOT EXISTS idx_sticky_channel ON sticky_messages(channel_id) WHERE active;
      CREATE INDEX IF NOT EXISTS idx_sticky_source ON sticky_messages(source_key) WHERE active;
