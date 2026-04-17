-- Migration 19: stock_alerts
-- Auto-extracted from dbMigrate.js

-- Sistema de alertas de stock crítico. Nem todos os items precisam
      -- de alerta (ex: jóias, diamantes, sucata artes e armas estragadas).
      --
      -- alert_enabled: se false → sem state badge na tab Stock, sem alerta.
      -- alert_threshold: quando balance global < threshold → dispara alerta.
      -- last_alert_at: throttle de 24h para não spammar o canal.
      ALTER TABLE items ADD COLUMN IF NOT EXISTS alert_enabled  BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE items ADD COLUMN IF NOT EXISTS alert_threshold INTEGER;
      ALTER TABLE items ADD COLUMN IF NOT EXISTS last_alert_at   TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_items_alert_enabled ON items(alert_enabled) WHERE alert_enabled = true;
