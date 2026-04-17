-- Migration 12: saidas_craft_amount_and_settled_flag
-- Auto-extracted from dbMigrate.js

ALTER TABLE operations ADD COLUMN IF NOT EXISTS craft_amount INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS settled BOOLEAN DEFAULT FALSE;
