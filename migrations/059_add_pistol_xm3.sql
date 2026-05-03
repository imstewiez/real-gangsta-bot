-- Migração 059: Adicionar Pistol XM3 ao catálogo + craft recipe (15 Peças)

BEGIN;

-- 1) Inserir o item na tabela items (idempotente)
INSERT INTO items (name, category, unit, estimated_value, active, orderable, counts_for_stock, counts_for_rankings, target_stock, created_at, updated_at)
VALUES ('Pistol XM3', 'armas_fogo', 'unidade', 53850, true, true, true, true, 0, NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  estimated_value = EXCLUDED.estimated_value,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  active = EXCLUDED.active,
  orderable = EXCLUDED.orderable,
  counts_for_stock = EXCLUDED.counts_for_stock,
  counts_for_rankings = EXCLUDED.counts_for_rankings,
  updated_at = NOW();

-- 2) Criar craft recipe: 15 Peças
DO $$
DECLARE
  v_item_id INTEGER;
  v_recipe_id INTEGER;
  v_pecas_id INTEGER;
BEGIN
  SELECT id INTO v_item_id FROM items WHERE name = 'Pistol XM3';
  SELECT id INTO v_pecas_id FROM items WHERE name = 'Peças';

  IF v_item_id IS NULL OR v_pecas_id IS NULL THEN
    RAISE NOTICE 'Pistol XM3 ou Peças não encontrado — craft recipe não criada.';
    RETURN;
  END IF;

  -- Criar/actualizar craft recipe
  INSERT INTO craft_recipes (item_id, category, tier)
  VALUES (v_item_id, 'armas_fogo', 'orange')
  ON CONFLICT (item_id) DO UPDATE SET
    category = EXCLUDED.category,
    tier = EXCLUDED.tier;

  SELECT id INTO v_recipe_id FROM craft_recipes WHERE item_id = v_item_id;

  -- Limpar ingredientes antigos e inserir o novo
  DELETE FROM recipe_ingredients WHERE recipe_id = v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
  VALUES (v_recipe_id, v_pecas_id, 15);
END $$;

COMMIT;
