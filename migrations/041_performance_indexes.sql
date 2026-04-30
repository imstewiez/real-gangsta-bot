-- Migration 41: performance indexes
-- Adiciona índices compostos críticos para acelerar as queries analíticas
-- do dashboard, rankings, e sync do Google Sheets.
--
-- Queries beneficiadas:
--   - getDashboardKPIs (stock, movimentos, saídas, material)
--   - getInventoryFull (last_movement, total_in, total_out)
--   - getMembersFull (entregas por membro)
--   - getSaidasFull (contagem de participantes)
--   - getRankings (top entregas, kills, profit)

-- ── inventory_movements ────────────────────────────────────────────────────
-- Acelera agregações por membro + tipo + data (dashboard, rankings, membros)
CREATE INDEX IF NOT EXISTS idx_im_member_type_created
  ON inventory_movements(member_id, movement_type, created_at);

-- Acelera lookups de undo por submission_id
CREATE INDEX IF NOT EXISTS idx_im_submission_id
  ON inventory_movements(submission_id);

-- Acelera cálculo de last_movement por item (inventory full)
CREATE INDEX IF NOT EXISTS idx_im_item_created
  ON inventory_movements(item_id, created_at);

-- ── operations ─────────────────────────────────────────────────────────────
-- Acelera TODAS as queries de saídas por período + status (dashboard, summaries)
CREATE INDEX IF NOT EXISTS idx_ops_date_status
  ON operations(date, status);

-- ── operation_participants ─────────────────────────────────────────────────
-- Acelera contagens por saída + tipo (getSaidasFull, dashboard participant breakdown)
CREATE INDEX IF NOT EXISTS idx_op_part_op_type
  ON operation_participants(operation_id, participant_type);

-- ── operation_materials ────────────────────────────────────────────────────
-- Acelera agregações de material por saída + direção (getSaidasFull)
CREATE INDEX IF NOT EXISTS idx_om_op_direction
  ON operation_materials(operation_id, direction);

-- ── kill_logs ──────────────────────────────────────────────────────────────
-- Acelera rankings de kills por killer + data
CREATE INDEX IF NOT EXISTS idx_kills_killer_created
  ON kill_logs(killer_id, created_at);

-- ── member_saida_stats ─────────────────────────────────────────────────────
-- Acelera lookups por member_id (já existe PK mas não índice dedicado para JOINs rápidos)
CREATE INDEX IF NOT EXISTS idx_mss_member
  ON member_saida_stats(member_id);

-- ── spot_stats ─────────────────────────────────────────────────────────────
-- Acelera ordenação por net_value e deaths (dashboard spots)
CREATE INDEX IF NOT EXISTS idx_spot_stats_net
  ON spot_stats(total_net_value DESC NULLS LAST) WHERE total_saidas > 0;
CREATE INDEX IF NOT EXISTS idx_spot_stats_deaths
  ON spot_stats(our_deaths DESC NULLS LAST) WHERE total_saidas > 0;
