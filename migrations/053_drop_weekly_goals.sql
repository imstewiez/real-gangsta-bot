-- Drop weekly goals system (non-functional, dead code)
-- Created: 2026-04-30

DROP TABLE IF EXISTS weekly_goal_progress;
DROP TABLE IF EXISTS weekly_goals;

DROP TYPE IF EXISTS goal_scope;
DROP TYPE IF EXISTS goal_metric;
