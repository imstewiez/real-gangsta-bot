-- Migration 26: fix_movement_type_constraint_and_qty
-- Auto-extracted from dbMigrate.js

-- Fix movement_type CHECK: aceitar *_saida (actuais) + legacy
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_bairrista', 'venda_bairrista', 'entrega_oficial',
          'fornecimento_org', 'consumo_saida', 'devolucao_saida',
          'ajuste_manual', 'perda_saida', 'apreendido', 'craftado',
          -- Legacy (lidos; escrita nova é só nos nomes novos):
          'entrega_morador', 'venda_morador',
          'consumo_operacao', 'devolucao_operacao', 'perda_operacao'
        ));

      -- Fix quantity CHECK: permitir negativos para ajuste_manual
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS chk_qty_positive;
      ALTER TABLE inventory_movements ADD CONSTRAINT chk_qty_nonzero CHECK (quantity <> 0);
