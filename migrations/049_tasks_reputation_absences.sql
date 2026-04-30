-- Migration 049: tasks, reputation, absences

CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');
CREATE TYPE task_type AS ENUM ('deliver', 'participate_saidas', 'manage_order', 'return_weapon', 'resolve_pending', 'custom');

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type task_type NOT NULL DEFAULT 'custom',
  target_member_id INTEGER REFERENCES members(id),
  assigned_by TEXT NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_member ON tasks(target_member_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS member_reputation (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  reliability_score NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  regular_delivery_rate NUMERIC(5,2) DEFAULT 0,
  saida_participation_rate NUMERIC(5,2) DEFAULT 0,
  availability_rate NUMERIC(5,2) DEFAULT 0,
  weapon_return_rate NUMERIC(5,2) DEFAULT 0,
  pending_ratio NUMERIC(5,2) DEFAULT 0,
  rejection_rate NUMERIC(5,2) DEFAULT 0,
  failed_results NUMERIC(5,2) DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id)
);

CREATE TABLE IF NOT EXISTS member_absences (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_absences_member ON member_absences(member_id);
CREATE INDEX IF NOT EXISTS idx_absences_dates ON member_absences(start_date, end_date);
