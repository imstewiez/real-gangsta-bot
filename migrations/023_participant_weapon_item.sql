-- Migration 23: participant_weapon_item
-- Auto-extracted from dbMigrate.js

ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS weapon_item_id INT REFERENCES items(id);
      CREATE INDEX IF NOT EXISTS idx_op_part_weapon_item ON operation_participants(weapon_item_id);
