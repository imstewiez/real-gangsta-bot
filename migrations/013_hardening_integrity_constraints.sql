-- Migration 13: hardening_integrity_constraints
-- Auto-extracted from dbMigrate.js

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS chk_qty_positive;
      ALTER TABLE inventory_movements ADD CONSTRAINT chk_qty_positive CHECK (quantity > 0);

      ALTER TABLE items DROP CONSTRAINT IF EXISTS chk_value_nonneg;
      ALTER TABLE items ADD CONSTRAINT chk_value_nonneg CHECK (estimated_value IS NULL OR estimated_value >= 0);

      -- Garante que cada user só tem 1 pedido pendente em paralelo
      CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_requests_pending_per_user
        ON tag_requests(discord_id) WHERE status = 'pending';
