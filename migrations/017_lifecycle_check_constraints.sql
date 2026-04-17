-- Migration 17: lifecycle_check_constraints
-- Auto-extracted from dbMigrate.js

-- ── CHECK constraints em tier + category para impedir lixo.
      --    NOT VALID = aplica-se só a novas inserções; legacy rows não são
      --    revalidadas (evita fail se houver alguma row com valor estranho).

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'members_tier_valid') THEN
          ALTER TABLE members ADD CONSTRAINT members_tier_valid
            CHECK (tier IS NULL OR tier IN (
              'young_blood', 'o_gunao', 'gangster_fodido', 'patrao_di_zona',
              'real_gangster', 'og', 'kingpin', 'manda_chuva'
            )) NOT VALID;
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_category_valid') THEN
          ALTER TABLE items ADD CONSTRAINT items_category_valid
            CHECK (category IN (
              'armas', 'acessorios', 'municoes',
              'metais', 'reciclagem', 'componentes', 'madeiras',
              'quimicos', 'electronica', 'droga', 'comida', 'pesca',
              'texteis', 'utilidade', 'outros'
            )) NOT VALID;
        END IF;
      END $$;
