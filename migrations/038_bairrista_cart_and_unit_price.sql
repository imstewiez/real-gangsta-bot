-- Migration 38: multi-item cart submission + per-line custom price + durable undo
--
-- Motivação:
--   - Fluxo novo de entrega/venda permite N itens numa submissão via carrinho.
--     Todos os movements de uma submissão partilham o mesmo `submission_id`
--     para (a) agrupar no log-bairristas, (b) permitir "Desfazer" por bulk.
--   - `unit_price` captura o preço efectivo (custom ou base) em vendas; stats
--     usam COALESCE(unit_price, items.estimated_value). Ranking continua a
--     usar quantidades (não muda nada aí).
--   - `log_message_id` + `log_channel_id` guardam o embed agregado para
--     poder ser editado / apagado no undo sem in-memory state.
--
-- Undo = HARD DELETE de movements com o mesmo submission_id + audit log;
-- sem coluna `cancelled_at` (evita filtros WHERE cancelled_at IS NULL
-- espalhados). Rastreável via audit_logs.
--
-- Todas as colunas são nullable — movements pré-cart não as têm (correcto).

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS submission_id UUID,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS log_message_id TEXT,
  ADD COLUMN IF NOT EXISTS log_channel_id TEXT;

-- Index para lookup rápido ao desfazer (DELETE WHERE submission_id = $1).
CREATE INDEX IF NOT EXISTS idx_inventory_movements_submission_id
  ON inventory_movements (submission_id)
  WHERE submission_id IS NOT NULL;
