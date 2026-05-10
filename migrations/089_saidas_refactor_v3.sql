-- Migration 089: saidas_refactor_v3
-- Refactor do domínio de saídas v3.0 — novos estados, colunas de team selection e rating

-- ── Novas colunas em operations ──────────────────────────────────────
ALTER TABLE operations
  ADD COLUMN IF NOT EXISTS team_selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fighters_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liquidation_started_at TIMESTAMPTZ;
-- workers_count já existe (mig 021)

-- ── Novas colunas em operation_participants ──────────────────────────
ALTER TABLE operation_participants
  ADD COLUMN IF NOT EXISTS selection_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pvp_rating_at_session INTEGER,
  ADD COLUMN IF NOT EXISTS rating_delta INTEGER DEFAULT 0;

-- ── Atualização do CHECK constraint de status ────────────────────────
ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_status_check;

-- Migração de dados: aberta → criada
UPDATE operations SET status = 'criada' WHERE status = 'aberta';

-- Novo CHECK constraint
ALTER TABLE operations ADD CONSTRAINT operations_status_check
  CHECK (status IN (
    'criada', 'trancagem', 'em_preparacao', 'em_curso', 'em_liquidacao', 'concluida', 'cancelada'
  ));
