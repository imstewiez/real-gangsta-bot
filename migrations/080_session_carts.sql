CREATE TABLE IF NOT EXISTS session_carts (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id TEXT NOT NULL UNIQUE,
    tipo VARCHAR(20) CHECK (tipo IN ('entrega','venda')),
    lines JSONB NOT NULL DEFAULT '[]',
    global_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);
CREATE INDEX idx_session_carts_discord ON session_carts(discord_id);
CREATE INDEX idx_session_carts_expires ON session_carts(expires_at);
