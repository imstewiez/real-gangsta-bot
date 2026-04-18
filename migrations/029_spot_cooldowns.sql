-- Migration 29: spot_cooldowns
-- Regista spots em cooldown após uma saída ser aberta.
-- Regra RP: quando sai uma saída num spot, esse spot fica "queimado" durante
-- N minutos — outras saídas da org não podem ir para lá. Cooldown arranca
-- na criação da saída e expira automaticamente via job.

CREATE TABLE IF NOT EXISTS spot_cooldowns (
  spot                TEXT PRIMARY KEY,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  saida_id            INTEGER,
  notification_channel_id  TEXT,
  notification_msg_id      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_spot_cooldowns_expires_at ON spot_cooldowns (expires_at);
