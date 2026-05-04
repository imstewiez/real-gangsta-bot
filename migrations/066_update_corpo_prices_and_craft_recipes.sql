-- Migration 066: Update corpo prices + fix craft recipe quantities
-- Corpos prices dropped from 70k-85k to 20k.
-- Taser price corrected to 70k.
-- Several red weapon craft recipes had wrong quantities (from 062).

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Update item prices
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE items SET estimated_value = 20000 WHERE name = 'Corpo Pistol XM3';
UPDATE items SET estimated_value = 20000 WHERE name = 'Corpo UZI';
UPDATE items SET estimated_value = 20000 WHERE name = 'Corpo TEC-9';
UPDATE items SET estimated_value = 20000 WHERE name = 'Corpo TEC Pistol';
UPDATE items SET estimated_value = 20000 WHERE name = 'Corpo AP Pistol';
UPDATE items SET estimated_value = 70000 WHERE name = 'Taser';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Update craft recipes (idempotent — wipes + re-inserts ingredients)
-- ══════════════════════════════════════════════════════════════════════════════

-- Helper: update recipe for a weapon red
-- Heavy Pistol: Peças 20 → 25
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Heavy Pistol';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 25 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- .50: Peças 15 → 40, Aço 2 → 5
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = '.50';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 40 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- P90: new or update (was "SMG de Assalto" in 060, now correctly named)
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'P90';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 40 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- PDW: Peças 15 → 40, Aço 2 → 5 (was "Combat PDW" in 060)
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'PDW';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 40 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- Gadget Pistol: Peças 15 → 50
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Gadget Pistol';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Barra de Ouro' UNION ALL
  SELECT v_recipe_id, id, 50 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- Bullpup: Peças 15 → 60, Aço 2 → 8
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Bullpup';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 8 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 60 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- Carabina Especial: Peças 60 → 65
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Carabina Especial';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 8 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 65 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Fix orange weapon recipes that still reference "Print de Orange"
--    (should be "Print Laranja" to match items table)
-- ══════════════════════════════════════════════════════════════════════════════

-- Mini SMG
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Mini SMG';
  IF v_item_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  IF v_recipe_id IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 10 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Corpo Mini SMG' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Laranja';
END $$;

-- Micro SMG
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Micro SMG';
  IF v_item_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  IF v_recipe_id IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 15 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Corpo UZI' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Laranja';
END $$;

-- Machine Pistol
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Machine Pistol';
  IF v_item_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  IF v_recipe_id IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 15 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Corpo TEC-9' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Laranja';
END $$;

-- TEC Pistol
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'TEC Pistol';
  IF v_item_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  IF v_recipe_id IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 20 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Corpo TEC Pistol' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Laranja';
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Clean up orphaned recipes (Portuguese names from 060 that don't match items)
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM craft_recipes
WHERE item_id IN (
  SELECT cr.item_id
  FROM craft_recipes cr
  LEFT JOIN items i ON i.id = cr.item_id
  WHERE i.id IS NULL
);

COMMIT;
