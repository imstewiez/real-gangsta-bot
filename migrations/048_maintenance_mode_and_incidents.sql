-- Migration 048: maintenance mode + incident tracking

CREATE TABLE IF NOT EXISTS maintenance_mode (
  id SERIAL PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT false,
  reason TEXT DEFAULT '',
  started_by TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

INSERT INTO maintenance_mode (id, active) VALUES (1, false)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','analysing','resolved','ignored')),
  source TEXT DEFAULT '', -- e.g. 'sheets', 'db', 'stock', 'ranking'
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
