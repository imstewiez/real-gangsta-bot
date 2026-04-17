-- Migration 16: lifecycle_metadata_foundation
-- Auto-extracted from dbMigrate.js

-- ── Soft-delete + versioning em tabelas mutáveis principais.
      --    Colunas puramente aditivas — nenhum código actual é partido,
      --    mas abre a porta para reconcile/audit/retention uniformes.
      --
      --    Convenção:
      --      deleted_at   — NULL = activo; timestamp = soft-deleted
      --      deleted_by   — actor (discord:id ou 'system:<jobname>')
      --      record_version — bump em cada mutation (optimistic locking)

      ALTER TABLE members              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE members              ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE members              ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE members              ADD COLUMN IF NOT EXISTS last_discord_reconciled_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_members_deleted_at ON members(deleted_at) WHERE deleted_at IS NOT NULL;

      ALTER TABLE operations           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE operations           ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE operations           ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_operations_deleted_at ON operations(deleted_at) WHERE deleted_at IS NOT NULL;

      ALTER TABLE items                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE items                ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE items                ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON items(deleted_at) WHERE deleted_at IS NOT NULL;

      ALTER TABLE resident_channels    ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      -- resident_channels já tinha deleted_at/archived_at nativos.

      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE availability_sessions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

      ALTER TABLE sticky_messages      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE sticky_messages      ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      ALTER TABLE sticky_messages      ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1;

      -- Sheet sync state — estado global por tab (não per-record).
      CREATE TABLE IF NOT EXISTS sheet_sync_state (
        tab_key         TEXT PRIMARY KEY,
        last_synced_at  TIMESTAMPTZ,
        last_result     TEXT NOT NULL DEFAULT 'unknown' CHECK (last_result IN ('ok','error','skipped','unknown')),
        last_ops        INTEGER,
        last_ms         INTEGER,
        last_error      TEXT,
        last_data_hash  TEXT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
