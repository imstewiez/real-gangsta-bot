-- Migration 8: radio
-- Auto-extracted from dbMigrate.js

-- ── Estado actual da rádio (1 linha por tipo) ───────────────────────────
      CREATE TABLE IF NOT EXISTS radio_state (
        radio_type      TEXT PRIMARY KEY CHECK (radio_type IN ('principal', 'parceria')),
        value           TEXT NOT NULL DEFAULT '',
        previous_value  TEXT NOT NULL DEFAULT '',
        mode            TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'random')),
        updated_by      TEXT NOT NULL DEFAULT '',
        note            TEXT NOT NULL DEFAULT '',
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Histórico de alterações ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS radio_history (
        id              SERIAL PRIMARY KEY,
        radio_type      TEXT NOT NULL CHECK (radio_type IN ('principal', 'parceria')),
        old_value       TEXT NOT NULL DEFAULT '',
        new_value       TEXT NOT NULL,
        mode            TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'random')),
        actor_id        TEXT NOT NULL,
        note            TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_radio_hist_type ON radio_history(radio_type);
      CREATE INDEX IF NOT EXISTS idx_radio_hist_created ON radio_history(created_at DESC);
