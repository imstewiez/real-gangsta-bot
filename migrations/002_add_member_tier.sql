-- Migration 2: add_member_tier
-- Auto-extracted from dbMigrate.js

ALTER TABLE members ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'young_blood';
      CREATE INDEX IF NOT EXISTS idx_members_tier ON members(tier);
