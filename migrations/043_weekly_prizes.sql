-- Migration 043: Criar tabela de prémios semanais
--
-- Regista o vencedor de cada semana, o prémio atribuído e o seu estado.
--
-- Estados:
--   por_definir  -> semana calculada, aguarda chefia escolher prémio
--   definido     -> chefia definiu o prémio
--   entregue     -> prémio foi entregue ao vencedor
--   cancelado    -> prémio cancelado
--   alterado     -> prémio foi alterado depois de definido

CREATE TABLE IF NOT EXISTS weekly_prizes (
  id SERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  winner_member_id INTEGER NOT NULL REFERENCES members(id),
  hybrid_score NUMERIC(12,2) NOT NULL,
  metrics_json JSONB NOT NULL DEFAULT '{}',
  prize_description TEXT DEFAULT '',
  prize_status TEXT NOT NULL DEFAULT 'por_definir'
    CHECK (prize_status IN ('por_definir', 'definido', 'entregue', 'cancelado', 'alterado')),
  defined_by TEXT,
  defined_at TIMESTAMPTZ,
  delivered_by TEXT,
  delivered_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_prizes_week ON weekly_prizes(week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_prizes_status ON weekly_prizes(prize_status);
CREATE INDEX IF NOT EXISTS idx_weekly_prizes_winner ON weekly_prizes(winner_member_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_weekly_prizes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_weekly_prizes_updated_at ON weekly_prizes;
CREATE TRIGGER trigger_weekly_prizes_updated_at
BEFORE UPDATE ON weekly_prizes
FOR EACH ROW
EXECUTE FUNCTION update_weekly_prizes_updated_at();
