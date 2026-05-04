-- Migration 065: Add ingredients_json to orders
-- Stores the recipe ingredients at order creation time so chefia
-- can see exactly what materials must be delivered.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'ingredients_json'
  ) THEN
    ALTER TABLE orders ADD COLUMN ingredients_json TEXT DEFAULT NULL;
  END IF;
END $$;
