-- Migration 092: Add Compact Pistol craft recipe (Print Azul)
-- Compact Pistol: 5 Aço, 20 Peças, 1 Print Azul

BEGIN;

DO $$
DECLARE v_item_id INTEGER; v_recipe_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Compact Pistol';
  IF v_item_id IS NULL THEN
    -- Create the item if it doesn't exist
    INSERT INTO items (name, category, unit, estimated_value, active, created_at, updated_at)
    VALUES ('Compact Pistol', 'armas_fogo', 'unidade', 280000, true, NOW(), NOW())
    ON CONFLICT (name) DO UPDATE SET
      category = EXCLUDED.category,
      unit = EXCLUDED.unit,
      updated_at = NOW()
    RETURNING id INTO v_item_id;
  END IF;

  IF v_item_id IS NULL THEN RETURN; END IF;

  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'craft_weapons', 'azul')
  ON CONFLICT (item_id) DO UPDATE SET category = EXCLUDED.category, tier = EXCLUDED.tier;

  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;

  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;

  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  SELECT v_recipe_id, id, 5 FROM items WHERE name = 'Aço' UNION ALL
  SELECT v_recipe_id, id, 20 FROM items WHERE name = 'Peças' UNION ALL
  SELECT v_recipe_id, id, 1 FROM items WHERE name = 'Print Azul';
END $$;

COMMIT;
