-- Migration 054: Craft recipes schema + order pricing columns
-- Created: 2026-04-30

-- ── Craft recipes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS craft_recipes (
  id        SERIAL PRIMARY KEY,
  item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category  TEXT NOT NULL DEFAULT 'outros',
  tier      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_craft_recipes_item ON craft_recipes(item_id);
CREATE INDEX IF NOT EXISTS idx_craft_recipes_category ON craft_recipes(category);

-- ── Recipe ingredients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id               SERIAL PRIMARY KEY,
  recipe_id        INTEGER NOT NULL REFERENCES craft_recipes(id) ON DELETE CASCADE,
  ingredient_item_id INTEGER NOT NULL REFERENCES items(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_item ON recipe_ingredients(ingredient_item_id);

-- ── Order pricing columns ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_mode') THEN
    ALTER TABLE orders ADD COLUMN payment_mode TEXT DEFAULT 'materials_money' CHECK (payment_mode IN ('materials_money', 'money_only'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'material_cost') THEN
    ALTER TABLE orders ADD COLUMN material_cost NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'money_cost') THEN
    ALTER TABLE orders ADD COLUMN money_cost NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'markup_percent') THEN
    ALTER TABLE orders ADD COLUMN markup_percent NUMERIC(5,2) DEFAULT 25.00;
  END IF;
END $$;

-- ── Price list messages (for Discord embed) ────────────────────────────────
CREATE TABLE IF NOT EXISTS price_list_messages (
  id            SERIAL PRIMARY KEY,
  channel_id    TEXT NOT NULL UNIQUE,
  message_id    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
