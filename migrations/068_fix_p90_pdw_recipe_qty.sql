-- Migration 068: Fix P90 and PDW craft recipe quantities
-- P90: 40 Peças → 45 Peças
-- PDW: 40 Peças → 45 Peças

BEGIN;

-- P90
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'P90';
  IF v_item_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  IF v_recipe_id IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 45 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

-- PDW
DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'PDW';
  IF v_item_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;
  IF v_recipe_id IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 45 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Vermelha';
END $$;

COMMIT;
