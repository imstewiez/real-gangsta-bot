CREATE TABLE IF NOT EXISTS circuit_state (
  tab TEXT PRIMARY KEY,
  failures INT NOT NULL DEFAULT 0,
  open_since BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
