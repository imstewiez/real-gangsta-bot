-- Migration 045: member lifecycle formalization
-- Adiciona estado de lifecycle e tabela de transições

CREATE TYPE member_lifecycle_state AS ENUM (
  'pending',
  'active',
  'away',
  'on_review',
  'promoted',
  'demoted',
  'removed',
  'left_discord'
);

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS lifecycle_state member_lifecycle_state NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_notes TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS member_lifecycle_history (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  old_state TEXT,
  new_state TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_mlh_member ON member_lifecycle_history(member_id);
CREATE INDEX IF NOT EXISTS idx_mlh_changed_at ON member_lifecycle_history(changed_at);
