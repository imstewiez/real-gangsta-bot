-- Migration 046: weekly goals system
-- Metas semanais para org, por membro e por role

CREATE TYPE goal_scope AS ENUM ('org', 'member', 'role');
CREATE TYPE goal_metric AS ENUM (
  'deliveries_qty',
  'deliveries_value',
  'sales_qty',
  'sales_value',
  'saidas_count',
  'kills_count',
  'availability_days',
  'orders_fulfilled'
);

CREATE TABLE IF NOT EXISTS weekly_goals (
  id SERIAL PRIMARY KEY,
  scope goal_scope NOT NULL,
  target_id TEXT DEFAULT '', -- member_id ou role_name ou vazio para org
  metric goal_metric NOT NULL,
  target_value NUMERIC(12,2) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  description TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scope, target_id, metric, week_start)
);

CREATE TABLE IF NOT EXISTS weekly_goal_progress (
  id SERIAL PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES weekly_goals(id) ON DELETE CASCADE,
  current_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  percent_complete NUMERIC(5,2) NOT NULL DEFAULT 0,
  hit_at TIMESTAMPTZ,
  announced BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wg_week ON weekly_goals(week_start);
CREATE INDEX IF NOT EXISTS idx_wg_scope ON weekly_goals(scope, target_id);
CREATE INDEX IF NOT EXISTS idx_wgp_goal ON weekly_goal_progress(goal_id);
