-- Migration 34: recover_tag_requests_columns
-- Mesma drift class que 030/031/032/033: schema_migrations tem id=28 marcada
-- como aplicada, mas a ALTER TABLE não correu em prod. Sintoma: aprovar um
-- tag request gera "Falha interna" em Discord porque processApproval faz
-- `UPDATE tag_requests SET processed_at = NOW()` e a coluna não existe.
--
-- Todas as statements são idempotentes — DBs saudáveis fazem no-op.

ALTER TABLE tag_requests
  ADD COLUMN IF NOT EXISTS denial_reason          TEXT,
  ADD COLUMN IF NOT EXISTS retry_count            INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_create_failed  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processed_at           TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_tag_requests_discord_id_status
  ON tag_requests (discord_id, status, created_at DESC);
