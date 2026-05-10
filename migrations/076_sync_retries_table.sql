CREATE TABLE IF NOT EXISTS sync_retries (
  id BIGSERIAL PRIMARY KEY,
  tab TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',
  payload JSONB DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_retries_pending ON sync_retries (next_retry_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sync_retries_tab ON sync_retries (tab, resolved_at);
