CREATE TABLE IF NOT EXISTS discord_member_daily_activity (
  discord_id       TEXT NOT NULL,
  activity_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count    INTEGER NOT NULL DEFAULT 0,
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (discord_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_discord_member_daily_activity_last
  ON discord_member_daily_activity (last_message_at DESC);
