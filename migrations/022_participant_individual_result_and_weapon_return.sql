-- Migration 22: participant_individual_result_and_weapon_return
-- Auto-extracted from dbMigrate.js

ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS individual_result_submitted BOOLEAN DEFAULT FALSE;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS individual_result_at TIMESTAMPTZ;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_return_status TEXT
        DEFAULT 'none'
        CHECK (weapon_return_status IN ('none','declared_returned','confirmed_returned','confirmed_not_returned','inconclusive','not_applicable'));
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_return_confirmed_by TEXT;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_return_confirmed_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_op_part_weapon_return ON operation_participants(weapon_return_status);
      CREATE INDEX IF NOT EXISTS idx_op_part_result_submitted ON operation_participants(individual_result_submitted);
