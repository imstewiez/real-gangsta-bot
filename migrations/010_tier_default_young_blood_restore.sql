-- Migration 10: tier_default_young_blood_restore
-- Auto-extracted from dbMigrate.js

ALTER TABLE members ALTER COLUMN tier SET DEFAULT 'young_blood';
