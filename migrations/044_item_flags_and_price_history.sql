-- Migration 044: item flags + price history
-- Adiciona flags de controle aos itens e tabela de histórico de preços

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS orderable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS counts_for_stock BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS counts_for_rankings BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS min_sale_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_sale_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS target_stock INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS item_price_history (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iph_item ON item_price_history(item_id);
CREATE INDEX IF NOT EXISTS idx_iph_changed_at ON item_price_history(changed_at);
