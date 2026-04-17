-- Migration 14: rankings_monthly_and_alltime
-- Auto-extracted from dbMigrate.js

CREATE TABLE IF NOT EXISTS monthly_rankings (
        id                   SERIAL PRIMARY KEY,
        member_id            INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        month_start          DATE NOT NULL,
        month_end            DATE NOT NULL,
        deliveries           INTEGER NOT NULL DEFAULT 0,
        sales                INTEGER NOT NULL DEFAULT 0,
        operations_count     INTEGER NOT NULL DEFAULT 0,
        weighted_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
        return_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
        kills_count          INTEGER NOT NULL DEFAULT 0,
        wins_count           INTEGER NOT NULL DEFAULT 0,
        loss_count           INTEGER NOT NULL DEFAULT 0,
        net_profit_generated NUMERIC(14,2) NOT NULL DEFAULT 0,
        survival_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
        performance_score    NUMERIC(8,2) NOT NULL DEFAULT 0,
        hybrid_score         NUMERIC(10,2) NOT NULL DEFAULT 0,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_monthly_member_month UNIQUE (member_id, month_start)
      );
      CREATE INDEX IF NOT EXISTS idx_monthly_rankings_month ON monthly_rankings(month_start);
      CREATE INDEX IF NOT EXISTS idx_monthly_rankings_hybrid ON monthly_rankings(hybrid_score DESC);

      -- All-time snapshots por membro (actualizados a cada recálculo mensal).
      CREATE TABLE IF NOT EXISTS all_time_stats (
        member_id            INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        deliveries           INTEGER NOT NULL DEFAULT 0,
        sales                INTEGER NOT NULL DEFAULT 0,
        saidas_total         INTEGER NOT NULL DEFAULT 0,
        wins                 INTEGER NOT NULL DEFAULT 0,
        losses               INTEGER NOT NULL DEFAULT 0,
        kills_total          INTEGER NOT NULL DEFAULT 0,
        deaths_total         INTEGER NOT NULL DEFAULT 0,
        mvp_count            INTEGER NOT NULL DEFAULT 0,
        profit_generated     NUMERIC(14,2) NOT NULL DEFAULT 0,
        weighted_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
        hybrid_score         NUMERIC(10,2) NOT NULL DEFAULT 0,
        first_activity       DATE,
        last_activity        DATE,
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_all_time_hybrid ON all_time_stats(hybrid_score DESC);
      CREATE INDEX IF NOT EXISTS idx_all_time_kills ON all_time_stats(kills_total DESC);
      CREATE INDEX IF NOT EXISTS idx_all_time_weighted ON all_time_stats(weighted_value DESC);
