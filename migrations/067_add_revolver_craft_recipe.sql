-- Migration 067: Add craft recipe for Revolver
-- Revolver: 60 Peças, 5 Aço, 5 Barra de Ouro, 1 Print Amarela

BEGIN;

DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Revolver';
  IF v_item_id IS NULL THEN RETURN; END IF;
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'red')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Barra de Ouro' UNION ALL
  SELECT v_recipe_id, id, 60 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Amarela';
END $$;

COMMIT;
