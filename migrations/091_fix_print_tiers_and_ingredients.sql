-- Migration 091: Fix weapon craft recipe tiers and print ingredients
-- Tier now reflects the print type (azul, amarela, vermelha) instead of generic 'red'/'orange'.
-- Weapons keep their craft_weapons category. Only the print ingredient and tier change.
--
-- Print Azul:  Heavy Pistol, .50, P90, PDW
-- Print Amarela: Revolver, Gadget Pistol
-- Print Vermelha: Bullpup, Carabina Especial

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Update tiers on craft_recipes
-- ══════════════════════════════════════════════════════════════════════════════

-- Print Azul weapons
UPDATE craft_recipes SET tier = 'azul' WHERE item_id = (SELECT id FROM items WHERE name = 'Heavy Pistol');
UPDATE craft_recipes SET tier = 'azul' WHERE item_id = (SELECT id FROM items WHERE name = '.50');
UPDATE craft_recipes SET tier = 'azul' WHERE item_id = (SELECT id FROM items WHERE name = 'P90');
UPDATE craft_recipes SET tier = 'azul' WHERE item_id = (SELECT id FROM items WHERE name = 'PDW');

-- Print Amarela weapons
UPDATE craft_recipes SET tier = 'amarela' WHERE item_id = (SELECT id FROM items WHERE name = 'Revolver');
UPDATE craft_recipes SET tier = 'amarela' WHERE item_id = (SELECT id FROM items WHERE name = 'Gadget Pistol');

-- Print Vermelha weapons
UPDATE craft_recipes SET tier = 'vermelha' WHERE item_id = (SELECT id FROM items WHERE name = 'Bullpup');
UPDATE craft_recipes SET tier = 'vermelha' WHERE item_id = (SELECT id FROM items WHERE name = 'Carabina Especial');

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Fix print ingredients for each weapon
-- ══════════════════════════════════════════════════════════════════════════════

-- Helper function to swap print ingredient in a recipe
-- Removes any existing print ingredient and adds the correct one

-- Heavy Pistol → Print Azul
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_azul INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = 'Heavy Pistol');
  SELECT id INTO v_print_azul FROM items WHERE name = 'Print Azul';
  IF v_recipe_id IS NULL OR v_print_azul IS NULL THEN RETURN; END IF;
  -- Remove any existing print ingredient
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  -- Add correct print
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_azul, 1);
END $$;

-- .50 → Print Azul
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_azul INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = '.50');
  SELECT id INTO v_print_azul FROM items WHERE name = 'Print Azul';
  IF v_recipe_id IS NULL OR v_print_azul IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_azul, 1);
END $$;

-- P90 → Print Azul
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_azul INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = 'P90');
  SELECT id INTO v_print_azul FROM items WHERE name = 'Print Azul';
  IF v_recipe_id IS NULL OR v_print_azul IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_azul, 1);
END $$;

-- PDW → Print Azul
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_azul INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = 'PDW');
  SELECT id INTO v_print_azul FROM items WHERE name = 'Print Azul';
  IF v_recipe_id IS NULL OR v_print_azul IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_azul, 1);
END $$;

-- Revolver → Print Amarela
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_amarela INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = 'Revolver');
  SELECT id INTO v_print_amarela FROM items WHERE name = 'Print Amarela';
  IF v_recipe_id IS NULL OR v_print_amarela IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_amarela, 1);
END $$;

-- Gadget Pistol → Print Amarela
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_amarela INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = 'Gadget Pistol');
  SELECT id INTO v_print_amarela FROM items WHERE name = 'Print Amarela';
  IF v_recipe_id IS NULL OR v_print_amarela IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_amarela, 1);
END $$;

-- Bullpup → Print Vermelha
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_vermelha INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = 'Bullpup');
  SELECT id INTO v_print_vermelha FROM items WHERE name = 'Print Vermelha';
  IF v_recipe_id IS NULL OR v_print_vermelha IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_vermelha, 1);
END $$;

-- Carabina Especial → Print Vermelha
DO $$
DECLARE v_recipe_id INTEGER;
DECLARE v_print_vermelha INTEGER;
BEGIN
  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = (SELECT id FROM items WHERE name = 'Carabina Especial');
  SELECT id INTO v_print_vermelha FROM items WHERE name = 'Print Vermelha';
  IF v_recipe_id IS NULL OR v_print_vermelha IS NULL THEN RETURN; END IF;
  DELETE FROM recipe_ingredients
  WHERE recipe_id = v_recipe_id
    AND ingredient_item_id IN (SELECT id FROM items WHERE name LIKE 'Print%');
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_print_vermelha, 1);
END $$;

COMMIT;
