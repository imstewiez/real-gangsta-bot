-- Migration 11: saidas_domain_evolution
-- Auto-extracted from dbMigrate.js

-- ── 1. Rename movement types ─────────────────────────────────────────
      UPDATE inventory_movements SET movement_type = 'consumo_saida'   WHERE movement_type = 'consumo_operacao';
      UPDATE inventory_movements SET movement_type = 'perda_saida'     WHERE movement_type = 'perda_operacao';
      UPDATE inventory_movements SET movement_type = 'devolucao_saida' WHERE movement_type = 'devolucao_operacao';

      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_morador', 'venda_morador', 'entrega_oficial',
          'fornecimento_org', 'consumo_saida', 'devolucao_saida',
          'ajuste_manual', 'perda_saida', 'apreendido', 'craftado'
        ));

      -- 2. Rename FK column operation_id → saida_id (index é recriado a seguir)
      ALTER INDEX IF EXISTS idx_im_operation RENAME TO idx_im_saida;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='inventory_movements' AND column_name='operation_id') THEN
          ALTER TABLE inventory_movements RENAME COLUMN operation_id TO saida_id;
        END IF;
      END $$;

      -- ── 3. Enrich operations (saídas) ────────────────────────────────────
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'sem_conflito'
        CHECK (result IN ('vitoria', 'derrota', 'empate', 'sem_conflito', 'abortada'));
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS spot_type TEXT DEFAULT '';
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS had_craft BOOLEAN DEFAULT FALSE;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS had_domination BOOLEAN DEFAULT FALSE;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS enemy_faction TEXT DEFAULT '';
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS returned_to_bairro_count INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS our_kills INTEGER DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS supplied_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS returned_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS lost_value     NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS consumed_value NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS gross_value    NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS net_value      NUMERIC(14,2) DEFAULT 0;
      ALTER TABLE operations ADD COLUMN IF NOT EXISTS was_profitable BOOLEAN;

      -- ── 4. Enrich operation_participants ─────────────────────────────────
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS deaths_count INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS downs INTEGER DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS issued_value   NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS returned_value NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS lost_value     NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS consumed_value NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS net_material_delta NUMERIC(12,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS performance_score NUMERIC(6,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS discipline_score  NUMERIC(6,2) DEFAULT 0;
      ALTER TABLE operation_participants ADD COLUMN IF NOT EXISTS mvp_flag BOOLEAN DEFAULT FALSE;

      -- ── 5. cemetery_kills → kill_logs ────────────────────────────────────
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cemetery_kills')
           AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='kill_logs') THEN
          ALTER TABLE cemetery_kills RENAME TO kill_logs;
        END IF;
      END $$;
      ALTER TABLE kill_logs ADD COLUMN IF NOT EXISTS victim_faction TEXT DEFAULT '';
      ALTER TABLE kill_logs ADD COLUMN IF NOT EXISTS spot TEXT DEFAULT '';
      ALTER TABLE kill_logs ADD COLUMN IF NOT EXISTS confirmed_by TEXT;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='kill_logs' AND column_name='operation_id') THEN
          ALTER TABLE kill_logs RENAME COLUMN operation_id TO saida_id;
        END IF;
      END $$;
      ALTER INDEX IF EXISTS idx_kills_killer    RENAME TO idx_kill_logs_killer;
      ALTER INDEX IF EXISTS idx_kills_date      RENAME TO idx_kill_logs_date;
      ALTER INDEX IF EXISTS idx_kills_operation RENAME TO idx_kill_logs_saida;

      -- ── 6. Spot stats (auto-actualizada no fecho de saída) ───────────────
      CREATE TABLE IF NOT EXISTS spot_stats (
        spot                  TEXT PRIMARY KEY,
        total_saidas          INTEGER NOT NULL DEFAULT 0,
        wins                  INTEGER NOT NULL DEFAULT 0,
        losses                INTEGER NOT NULL DEFAULT 0,
        draws                 INTEGER NOT NULL DEFAULT 0,
        no_conflict_runs      INTEGER NOT NULL DEFAULT 0,
        total_supplied_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_returned_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_lost_value      NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_gross_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_net_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
        our_kills             INTEGER NOT NULL DEFAULT 0,
        our_deaths            INTEGER NOT NULL DEFAULT 0,
        best_member_id        INTEGER REFERENCES members(id),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_spot_stats_net ON spot_stats(total_net_value DESC);

      -- ── 7. Member saida stats ────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS member_saida_stats (
        member_id             INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        saidas_total          INTEGER NOT NULL DEFAULT 0,
        wins                  INTEGER NOT NULL DEFAULT 0,
        losses                INTEGER NOT NULL DEFAULT 0,
        draws                 INTEGER NOT NULL DEFAULT 0,
        kills_total           INTEGER NOT NULL DEFAULT 0,
        deaths_total          INTEGER NOT NULL DEFAULT 0,
        kd_ratio              NUMERIC(8,2) NOT NULL DEFAULT 0,
        profit_generated      NUMERIC(14,2) NOT NULL DEFAULT 0,
        material_return_rate  NUMERIC(5,2) NOT NULL DEFAULT 0,
        survival_rate         NUMERIC(5,2) NOT NULL DEFAULT 0,
        mvp_count             INTEGER NOT NULL DEFAULT 0,
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_mss_kills ON member_saida_stats(kills_total DESC);
      CREATE INDEX IF NOT EXISTS idx_mss_profit ON member_saida_stats(profit_generated DESC);

      -- ── 8. Weekly rankings enriched ──────────────────────────────────────
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS kills_count       INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS wins_count        INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS loss_count        INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS net_profit_generated NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS survival_rate     NUMERIC(5,2)  NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS performance_score NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS hybrid_score      NUMERIC(10,2) NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_wr_hybrid ON weekly_rankings(hybrid_score DESC);
