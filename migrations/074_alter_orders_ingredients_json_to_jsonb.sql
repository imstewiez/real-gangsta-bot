ALTER TABLE orders ALTER COLUMN ingredients_json TYPE JSONB USING ingredients_json::jsonb;
CREATE INDEX IF NOT EXISTS idx_orders_ingredients_json ON orders USING GIN (ingredients_json);
