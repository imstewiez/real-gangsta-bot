-- Migration 32: sheet_sync_state_consecutive_errors
-- Adiciona contador de falhas consecutivas por tab. Incrementa em cada erro
-- e reseta para 0 em sync bem-sucedido. Serve dois propósitos:
--   1) Operadores vêem "tab X falhou 5× seguidas" no /sync-sheets status
--      — sinal forte de bug persistente (não transitório)
--   2) Permite alerting futuro (ex: "consecutive_errors >= 3 → ping")

ALTER TABLE sheet_sync_state
  ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER NOT NULL DEFAULT 0;
