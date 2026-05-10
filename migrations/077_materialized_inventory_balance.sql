CREATE TABLE IF NOT EXISTS inventory_balance (
  item_id INT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT 'armazem',
  balance INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, location)
);
CREATE INDEX idx_inventory_balance_location ON inventory_balance(location);
