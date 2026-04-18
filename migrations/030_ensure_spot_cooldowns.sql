-- Migration 30: ensure_spot_cooldowns
-- Safety net — observado em 2026-04-18 que algumas DBs têm entry em
-- schema_migrations para a 029 mas não têm a tabela `spot_cooldowns`
-- (aplicação parcial em algum reboot ou DB reset manual que não
-- invalidou schema_migrations).
--
-- Como CREATE TABLE IF NOT EXISTS é idempotente, correr 2× não parte
-- nada. DBs saudáveis fazem no-op; DBs em drift recuperam a tabela.

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
