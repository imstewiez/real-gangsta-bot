-- Migration 055: Add updated_at to items table

ALTER TABLE items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing rows
UPDATE items SET updated_at = created_at WHERE updated_at IS NULL;
