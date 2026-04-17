-- Migration 18: archival_log_and_retention
-- Auto-extracted from dbMigrate.js

-- Log imutável de acções de retenção/archive/purge. Permite responder
      -- à pergunta "quando e porque é que este registo desapareceu?" sem
      -- depender de audit_logs (que pode ele próprio ter sido purgado).
      CREATE TABLE IF NOT EXISTS archival_log (
        id           SERIAL PRIMARY KEY,
        domain       TEXT NOT NULL,                    -- ex: 'audit_logs', 'job_runs'
        action       TEXT NOT NULL CHECK (action IN ('archive','soft_delete','hard_delete','purge')),
        entity_ref   TEXT,                             -- id serializado ou WHERE snippet
        row_count    INTEGER NOT NULL DEFAULT 0,
        actor        TEXT NOT NULL,                    -- 'system:retention' ou discord:id
        reason       TEXT DEFAULT '',
        payload      JSONB,                            -- contexto extra (bounds, counts, etc)
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_archival_log_domain ON archival_log(domain);
      CREATE INDEX IF NOT EXISTS idx_archival_log_created ON archival_log(created_at DESC);
