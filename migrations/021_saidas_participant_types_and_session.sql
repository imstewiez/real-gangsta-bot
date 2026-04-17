-- Migration 21: saidas_participant_types_and_session
-- Auto-extracted from dbMigrate.js

-- ── Participant types ───────────────────────────────────────────────
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS participant_type TEXT
        DEFAULT 'caracterizado' CHECK (participant_type IN ('caracterizado', 'trabalhador'));
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS own_weapon BOOLEAN DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_op_part_type ON operation_participants(participant_type);

      -- ── Saída session + counts ──────────────────────────────────────────
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS characterized_count INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS workers_count INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS crafted_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS allow_workers BOOLEAN DEFAULT TRUE;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS session_message_id TEXT;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS session_channel_id TEXT;
