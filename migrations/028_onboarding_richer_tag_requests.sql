-- Migration 28: onboarding_richer_tag_requests
-- Enriquece tag_requests para suportar denial com razão + retry de canal +
-- audit de momento de processamento.
--
-- Todas as colunas são nullable / com default → zero risco para rows existentes.

ALTER TABLE tag_requests
  ADD COLUMN IF NOT EXISTS denial_reason          TEXT,
  ADD COLUMN IF NOT EXISTS retry_count            INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_create_failed  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processed_at           TIMESTAMPTZ;

-- Índice para /rg-meu-pedido (lookup do pedido mais recente por user).
CREATE INDEX IF NOT EXISTS ix_tag_requests_discord_id_status
  ON tag_requests (discord_id, status, created_at DESC);
