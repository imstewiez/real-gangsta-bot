CREATE TABLE IF NOT EXISTS delivery_batches (
    id UUID PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrega', 'venda')),
    total_qty INTEGER NOT NULL DEFAULT 0,
    total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    global_notes TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_batches_member ON delivery_batches(member_id);
CREATE INDEX IF NOT EXISTS idx_delivery_batches_created_at ON delivery_batches(created_at);
