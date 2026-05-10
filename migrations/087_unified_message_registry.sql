-- Migration 087: unified_message_registry
-- Registo centralizado de todas as mensagens geridas pelo bot.

CREATE TYPE bot_message_type AS ENUM ('panel', 'sticky', 'workflow', 'ephemeral', 'notification', 'audit');
CREATE TYPE bot_message_status AS ENUM ('active', 'stale', 'orphaned', 'deleted', 'failed');

CREATE TABLE IF NOT EXISTS bot_messages (
    id BIGSERIAL PRIMARY KEY,
    discord_msg_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    guild_id TEXT,
    message_type bot_message_type NOT NULL,
    source_key TEXT,
    owner_id TEXT,
    status bot_message_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_validated TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- Apenas uma mensagem activa por (canal, source) para painéis e sticky.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_per_source
    ON bot_messages (channel_id, source_key, status)
    WHERE status = 'active' AND message_type IN ('panel', 'sticky');

CREATE INDEX IF NOT EXISTS idx_bot_messages_lookup ON bot_messages(discord_msg_id);
CREATE INDEX IF NOT EXISTS idx_bot_messages_type_status ON bot_messages(message_type, status);
CREATE INDEX IF NOT EXISTS idx_bot_messages_expires ON bot_messages(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bot_messages_owner ON bot_messages(owner_id) WHERE owner_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_bot_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bot_messages_updated_at ON bot_messages;
CREATE TRIGGER trg_bot_messages_updated_at
    BEFORE UPDATE ON bot_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_bot_messages_updated_at();
