-- Migration 27: drop_legacy_domain_values
-- Fecha a janela de compatibilidade aberta pelas migrations 020 e 026.
-- Remove valores legacy dos CHECK constraints de members.role e
-- inventory_movements.movement_type. Ver docs/DEPRECATION.md.
--
-- Ordem importante:
--   1) safety net: reconverte qualquer row que ainda tenha valores legacy
--      (entretanto alguém pode ter inserido via alias)
--   2) recria CHECK constraints apenas com os nomes novos

-- ── Safety net ─────────────────────────────────────────────────────────────
UPDATE members SET role = 'bairrista'      WHERE role = 'morador';
UPDATE members SET role = 'patrao_di_zona' WHERE role = 'chefe_moradores';

UPDATE inventory_movements SET movement_type = 'entrega_bairrista' WHERE movement_type = 'entrega_morador';
UPDATE inventory_movements SET movement_type = 'venda_bairrista'   WHERE movement_type = 'venda_morador';
UPDATE inventory_movements SET movement_type = 'consumo_saida'     WHERE movement_type = 'consumo_operacao';
UPDATE inventory_movements SET movement_type = 'devolucao_saida'   WHERE movement_type = 'devolucao_operacao';
UPDATE inventory_movements SET movement_type = 'perda_saida'       WHERE movement_type = 'perda_operacao';

-- ── CHECK constraints sem legacy ───────────────────────────────────────────
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check
  CHECK (role IN ('bairrista', 'patrao_di_zona', 'oficial', 'chefia', 'inativo'));

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN (
    'saldo_inicial',
    'entrega_bairrista', 'venda_bairrista', 'entrega_oficial',
    'fornecimento_org', 'consumo_saida', 'devolucao_saida',
    'ajuste_manual', 'perda_saida', 'apreendido', 'craftado'
  ));
