-- Migration 15: inventory_location_per_house
-- Auto-extracted from dbMigrate.js

-- ── Stock por localização (CASA 1 = armazém só chefes;
      --     CASA 2 = casa do grupo, oficiais)
      ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS location TEXT
        CHECK (location IS NULL OR location IN ('armazem', 'grupo'));
      CREATE INDEX IF NOT EXISTS idx_im_location ON inventory_movements(location);

      -- Items: novas categorias adicionadas (acessorios, droga, comida, pesca,
      -- electronica, municoes, utilidade, armas). Sem CHECK constraint para
      -- permitir flexibilidade.
