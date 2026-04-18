-- Migration 33: recover_missing_schema
-- Observado em Railway prod em 2026-04-18: schema_migrations tem IDs 30, 31,
-- 32 registados como aplicados, MAS o schema real não tem as estruturas que
-- essas migrations deviam ter criado. Sintomas em logs:
--   • "relation "spot_cooldowns" does not exist" (de 030/031)
--   • "column "consecutive_errors" of relation "sheet_sync_state" does not exist" (de 032)
--
-- Hipótese: aplicação parcial num reboot anterior (INSERT em schema_migrations
-- correu, DDL falhou silenciosamente), OU drop manual das estruturas depois
-- de aplicadas. Seja qual for a causa, os IDs antigos não voltam a correr.
--
-- Esta migration tem ID novo (33), portanto corre garantidamente. Todas as
-- statements são idempotentes (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS) — DBs saudáveis fazem no-op; DBs em drift recuperam.

CREATE TABLE IF NOT EXISTS spot_cooldowns (
  spot                     TEXT PRIMARY KEY,
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at               TIMESTAMPTZ NOT NULL,
  saida_id                 INTEGER,
  notification_channel_id  TEXT,
  notification_msg_id      TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_spot_cooldowns_expires_at ON spot_cooldowns (expires_at);

ALTER TABLE sheet_sync_state
  ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER NOT NULL DEFAULT 0;
