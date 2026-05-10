CREATE TABLE IF NOT EXISTS pending_notifications (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  priority INT NOT NULL DEFAULT 5,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX idx_pending_notifications_retry ON pending_notifications(next_retry_at) WHERE sent_at IS NULL AND attempts < max_attempts;
