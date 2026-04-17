-- Migration 4: inventory_saldo_inicial_and_cemetery
-- Auto-extracted from dbMigrate.js

-- ── Allow saldo_inicial movement type ──────────────────────────────────
      ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
      ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
        CHECK (movement_type IN (
          'saldo_inicial',
          'entrega_morador', 'venda_morador', 'entrega_oficial',
          'fornecimento_org', 'consumo_operacao', 'devolucao_operacao',
          'ajuste_manual', 'perda_operacao', 'apreendido', 'craftado'
        ));

      -- ── Track bootstrap state (one-shot per seed source) ───────────────────
      CREATE TABLE IF NOT EXISTS inventory_bootstrap (
        id          SERIAL PRIMARY KEY,
        source      TEXT NOT NULL,
        applied_by  TEXT NOT NULL,
        items_count INTEGER NOT NULL DEFAULT 0,
        total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        notes       TEXT DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Cemetery (kills registadas) ────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS cemetery_kills (
        id              SERIAL PRIMARY KEY,
        killer_id       INTEGER NOT NULL REFERENCES members(id),
        victim_name     TEXT NOT NULL,
        victim_discord_id TEXT,
        context         TEXT DEFAULT '',
        operation_id    INTEGER REFERENCES operations(id),
        date            DATE NOT NULL DEFAULT CURRENT_DATE,
        notes           TEXT DEFAULT '',
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_kills_killer ON cemetery_kills(killer_id);
      CREATE INDEX IF NOT EXISTS idx_kills_date ON cemetery_kills(date);
      CREATE INDEX IF NOT EXISTS idx_kills_operation ON cemetery_kills(operation_id);
