-- Migration 6: tier_default_o_gunao
-- Auto-extracted from dbMigrate.js

ALTER TABLE members ALTER COLUMN tier SET DEFAULT 'o_gunao';
