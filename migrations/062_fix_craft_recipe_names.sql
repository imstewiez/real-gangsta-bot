-- Migração 062: Corrigir recipes de craft com nomes errados
-- A migration 060 usou nomes em português (Pistola XM3, etc.) mas os items
-- estão em inglês (Pistol XM3, etc.). Esta migration cria as recipes em falta.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- Helpers: criar recipe + ingredientes de forma idempotente
-- ══════════════════════════════════════════════════════════════════════════════

-- Recipe: Pistol XM3 (estava "Pistola XM3")
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Pistol XM3';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'orange')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 10 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Corpo Pistol XM3' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Laranja';
END $$;

-- Recipe: .50 (estava "Pistola .50")
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
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 15 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- Recipe: Gadget Pistol (estava "Pistola Gadget")
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
  SELECT v_recipe_id, id, 15 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- Recipe: PDW (estava "Combat PDW")
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
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 15 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- Recipe: Bullpup (estava "Bullpup Rifle")
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
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 15 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- Recipe: AP Pistol (estava "AP Pistola")
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'AP Pistol';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'orange')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 2 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 10 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Corpo AP Pistol' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Laranja';
END $$;

COMMIT;
