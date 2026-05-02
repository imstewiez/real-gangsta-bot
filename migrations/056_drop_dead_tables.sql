-- Migration 56: drop_dead_tables
-- Remove tabelas que nunca foram referenciadas em código de produção.
-- Ver docs/DEPRECATION.md para histórico.
--
-- Tabelas removidas:
--   - settings (001): nunca usada — config é via env vars.
--   - idempotency_ops (001): nunca usada — idempotência não foi implementada.
--   - inventory_bootstrap (004): substituída por saldo_inicial em items.
--   - maintenance_mode (048): nunca usada — não há UI de maintenance mode.
--   - member_reputation (049): nunca usada — sistema de reputação não implementado.
--   - tasks (049): nunca usada — sistema de tasks não implementado.

DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS idempotency_ops;
DROP TABLE IF EXISTS inventory_bootstrap;
DROP TABLE IF EXISTS maintenance_mode;
DROP TABLE IF EXISTS member_reputation;
DROP TABLE IF EXISTS tasks;
