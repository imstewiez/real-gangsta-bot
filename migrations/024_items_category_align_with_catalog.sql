-- Migration 24: items_category_align_with_catalog
-- Auto-extracted from dbMigrate.js

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_valid;
      ALTER TABLE items ADD CONSTRAINT items_category_valid
        CHECK (category IN (
          -- Catálogo actual (config/full-inventory.json)
          'dinheiro', 'metais', 'sucata_industria', 'quimicos_droga',
          'comida_pesca', 'equipamento', 'municoes', 'armas_fogo', 'armas_brancas',
          -- Legacy (migração #19) — mantidos para não partir rows antigas
          'armas', 'acessorios', 'reciclagem', 'componentes', 'madeiras',
          'quimicos', 'electronica', 'droga', 'comida', 'pesca',
          'texteis', 'utilidade', 'outros'
        )) NOT VALID;
