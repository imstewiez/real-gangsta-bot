CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_week ON inventory_movements(created_at) WHERE created_at > NOW() - INTERVAL '30 days';
