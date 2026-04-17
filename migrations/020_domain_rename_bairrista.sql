-- Migration 20: domain_rename_bairrista
-- Auto-extracted from dbMigrate.js

-- ══════════════════════════════════════════════════════════════════════
      -- Renomeação de domínio: "morador(es)" → "bairrista(s)",
      --                       "chefe_moradores" → "patrao_di_zona" (role).
      --
      -- Estratégia: estende CHECK constraints para aceitar os novos valores
      -- e MIGRA todas as rows existentes. Os valores antigos permanecem
      -- aceites pela CHECK durante a transição (próxima release remove-os).
      -- ══════════════════════════════════════════════════════════════════════

      -- 1) Drop + recria CHECK do members.role com os novos valores + legacy.
      ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
      ALTER TABLE members ADD CONSTRAINT members_role_check
        CHECK (role IN (
          'bairrista', 'patrao_di_zona', 'oficial', 'chefia', 'inativo',
          'morador', 'chefe_moradores'
        ));

      -- 2) Migra dados: morador → bairrista, chefe_moradores → patrao_di_zona.
      UPDATE members SET role = 'bairrista'      WHERE role = 'morador';
      UPDATE members SET role = 'patrao_di_zona' WHERE role = 'chefe_moradores';

      -- 3) Drop + recria CHECK do inventory_movements.movement_type.
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_bairrista', 'venda_bairrista', 'entrega_oficial',
          'fornecimento_org', 'consumo_operacao', 'devolucao_operacao',
          'ajuste_manual', 'perda_operacao', 'apreendido', 'craftado',
          -- Legacy (lidos; escrita nova é só nos nomes novos):
          'entrega_morador', 'venda_morador'
        ));

      -- 4) Migra movimentos históricos para os novos nomes.
      UPDATE inventory_movements SET movement_type = 'entrega_bairrista' WHERE movement_type = 'entrega_morador';
      UPDATE inventory_movements SET movement_type = 'venda_bairrista'   WHERE movement_type = 'venda_morador';

      -- 5) Default da coluna members.role passa para 'bairrista'.
      ALTER TABLE members ALTER COLUMN role SET DEFAULT 'bairrista';
