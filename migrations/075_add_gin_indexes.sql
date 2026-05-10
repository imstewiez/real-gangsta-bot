CREATE INDEX IF NOT EXISTS idx_inventory_delivery_requests_lines ON inventory_delivery_requests USING GIN (lines);
CREATE INDEX IF NOT EXISTS idx_availability_sessions_slots ON availability_sessions USING GIN (slots_json);
