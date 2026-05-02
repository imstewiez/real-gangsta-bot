-- Migration 053: drop weekly goals system (rollback of 046)
-- Tables, indexes, and enums are removed.

DROP TABLE IF EXISTS weekly_goal_progress;
DROP TABLE IF EXISTS weekly_goals;
DROP TYPE IF EXISTS goal_metric;
DROP TYPE IF EXISTS goal_scope;
