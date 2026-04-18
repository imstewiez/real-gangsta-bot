-- Migration 31: recover_spot_cooldowns
-- Observado em 2026-04-18 em Railway prod: schema_migrations tem id=30 mas
-- `spot_cooldowns` continua ausente. Hipótese: aplicação parcial da 029/030
-- num reboot onde o INSERT em schema_migrations correu mas o DDL falhou
-- ou a tabela foi dropada manualmente depois. Seja qual for a causa, a
-- migration 030 já não volta a correr porque o runner vê id=30 aplicada.
--
-- Este ID novo (31) força re-execução. CREATE TABLE IF NOT EXISTS continua
-- idempotente: DBs saudáveis fazem no-op; DBs em drift recuperam a tabela.

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
