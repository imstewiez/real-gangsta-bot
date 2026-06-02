-- Webapp source-of-truth support for Gestão de Materiais.
-- This repo runs migrations on Railway, so DB-changing webapp migrations must also live here.

ALTER TABLE item_tier_surcharges
  ADD COLUMN IF NOT EXISTS price_with_material numeric,
  ADD COLUMN IF NOT EXISTS price_without_material numeric;

UPDATE item_tier_surcharges its
SET price_with_material = i.min_sale_price + its.surcharge
FROM items i
WHERE i.id = its.item_id
  AND its.price_with_material IS NULL
  AND its.surcharge IS NOT NULL
  AND its.surcharge <> 0
  AND i.min_sale_price IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_tier_surcharges_item_tier
  ON item_tier_surcharges(item_id, tier);

CREATE TABLE IF NOT EXISTS recipe_ingredient_tier_overrides (
  id bigserial PRIMARY KEY,
  recipe_id integer NOT NULL REFERENCES craft_recipes(id) ON DELETE CASCADE,
  ingredient_item_id integer NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tier text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS recipe_ingredient_tier_overrides_unique
  ON recipe_ingredient_tier_overrides(recipe_id, ingredient_item_id, tier);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredient_tier_overrides_recipe
  ON recipe_ingredient_tier_overrides(recipe_id);

WITH target_prices(norm_name, price) AS (
  VALUES
    ('taninos', 20),
    ('radioestragado', 25),
    ('telemovelestragado', 25),
    ('sucata', 40),
    ('serradura', 40),
    ('carvao', 40),
    ('tabuapinho', 40),
    ('plasticoreciclado', 40),
    ('tabuacarvalho', 65),
    ('borracha', 65),
    ('tabuacerejeira', 60),
    ('ferro', 65),
    ('tecido', 65),
    ('cobre', 65),
    ('lixoeletronico', 60),
    ('polvora', 100),
    ('tabuaebano', 200),
    ('kevlar', 600),
    ('papel', 100),
    ('couro', 1500),
    ('aco', 1000)
), normalized_items AS (
  SELECT i.id,
         lower(regexp_replace(
           translate(trim(i.name),
             'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
             'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
           ),
           '[^a-zA-Z0-9]+', '', 'g'
         )) AS norm_name
  FROM items i
  WHERE i.deleted_at IS NULL
), matched AS (
  SELECT DISTINCT ni.id, tp.price
  FROM normalized_items ni
  JOIN target_prices tp ON tp.norm_name = ni.norm_name
)
UPDATE items i
SET purchase_price = matched.price,
    morador_purchase_price = matched.price,
    estimated_value = matched.price,
    side = CASE
      WHEN i.side = 'venda' THEN 'ambos'
      WHEN i.side IS NULL THEN 'compra'
      ELSE i.side
    END,
    updated_at = now()
FROM matched
WHERE i.id = matched.id;
