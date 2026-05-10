-- ============================================
-- MIGRATION 090: Limpeza de colunas mortas
-- ============================================
-- Colunas confirmadas como nunca referenciadas em código de aplicação.

-- operations.allow_workers — adicionada em 021, nunca usada
ALTER TABLE operations DROP COLUMN IF EXISTS allow_workers;

-- operations.session_started_at — adicionada em 037, nunca lida/escrita por app
ALTER TABLE operations DROP COLUMN IF EXISTS session_started_at;
