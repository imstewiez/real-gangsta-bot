-- Migration 063: Stock v3 — catálogo fixo de 10 artigos controlados pela chefia
-- Tabelas: stock_v3_pricing (preços de custo) + stock_v3_movements (ledger)

-- Preços de custo unitário para artigos "brutos" (não craftados)
CREATE TABLE IF NOT EXISTS stock_v3_pricing (
  id          SERIAL PRIMARY KEY,
  item_key    VARCHAR(50) NOT NULL UNIQUE,
  unit_cost   NUMERIC(15,2) NOT NULL DEFAULT 0,
  updated_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Movimentos do stock v3 (entradas, vendas, entregas/prémios)
CREATE TABLE IF NOT EXISTS stock_v3_movements (
  id                 SERIAL PRIMARY KEY,
  item_key           VARCHAR(50) NOT NULL,
  movement_type      VARCHAR(30) NOT NULL CHECK (movement_type IN ('entrada','venda','entrega')),
  quantity           INTEGER NOT NULL,
  unit_cost          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_cost         NUMERIC(15,2) NOT NULL DEFAULT 0,
  sale_price         NUMERIC(15,2),              -- apenas para vendas
  gross_profit       NUMERIC(15,2),              -- apenas para vendas
  net_profit         NUMERIC(15,2),              -- apenas para vendas
  total_loss         NUMERIC(15,2),              -- apenas para entregas
  recipient_member_id INTEGER,                   -- membro que recebeu (entrega/prémio)
  reason             VARCHAR(100),               -- compra / craft / recebimento / entrega / prémio
  notes              TEXT,
  created_by         VARCHAR(100) NOT NULL,
  created_by_id      VARCHAR(50) NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_v3_movements_item_key ON stock_v3_movements(item_key);
CREATE INDEX IF NOT EXISTS idx_stock_v3_movements_type ON stock_v3_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_v3_movements_created_at ON stock_v3_movements(created_at);

-- Seed inicial: 10 artigos fixos com preço 0 (a chefia define depois)
INSERT INTO stock_v3_pricing (item_key, unit_cost) VALUES
  ('droga', 0),
  ('dinheiro', 0),
  ('armas', 0),
  ('carregadores', 0),
  ('acessorios', 0),
  ('coletes', 0),
  ('prints', 0),
  ('corpos', 0),
  ('cobre', 0),
  ('polvora', 0)
ON CONFLICT (item_key) DO NOTHING;
