-- Migration 057: Expandir estados de encomendas + corrigir colunas
--
-- Adiciona 'in_progress' e 'ready' ao ciclo de vida de orders.
-- Corrige a CHECK constraint para suportar todos os estados válidos.
--
-- Fluxo:
--   pending → in_progress → ready → fulfilled
--   pending → denied|cancelled (qualquer estado → denied é permitido)

-- 1. Remover CHECK constraint antiga e criar nova
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'approved', 'in_progress', 'ready', 'fulfilled', 'denied', 'cancelled'));

-- 2. Adicionar coluna cancelled_by (simétrica com approved_by/fulfilled_by)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 3. Índice para queries de chefia (encomendas por estado)
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
