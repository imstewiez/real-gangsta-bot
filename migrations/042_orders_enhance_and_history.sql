-- Migration 042: Melhorar tabela orders + criar auditoria de estado
--
-- Adiciona campos que faltavam para um sistema de encomendas completo:
--   - unit_price: preço congelado no momento da criação
--   - total_price: qty * unit_price
--   - expected_at: data prevista de entrega
--   - delivered_at: data real de entrega
--   - delivered_qty: quantidade entregue (para entregas parciais)
--   - updated_at / updated_by: rastreio de alterações
--
-- Cria order_status_history para auditoria completa de transições.

-- 1. Adicionar colunas à tabela orders (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'unit_price') THEN
    ALTER TABLE orders ADD COLUMN unit_price NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_price') THEN
    ALTER TABLE orders ADD COLUMN total_price NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'expected_at') THEN
    ALTER TABLE orders ADD COLUMN expected_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivered_at') THEN
    ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivered_qty') THEN
    ALTER TABLE orders ADD COLUMN delivered_qty INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'updated_at') THEN
    ALTER TABLE orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'updated_by') THEN
    ALTER TABLE orders ADD COLUMN updated_by TEXT;
  END IF;
END $$;

-- 2. Criar tabela de histórico de estado
CREATE TABLE IF NOT EXISTS order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at DESC);
