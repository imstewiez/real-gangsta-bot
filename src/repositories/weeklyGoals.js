'use strict';
/**
 * Weekly goals repository.
 */

const { query, queryWithTransaction } = require('../db');

async function create({ scope, targetId, metric, targetValue, weekStart, weekEnd, description, createdBy }) {
  const res = await query(
    `INSERT INTO weekly_goals (scope, target_id, metric, target_value, week_start, week_end, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [scope, targetId, metric, targetValue, weekStart, weekEnd, description, createdBy]
  );
  return res.rows[0];
}

async function findByWeek(weekStart) {
  const res = await query(
    `SELECT g.*, COALESCE(p.current_value, 0) as current_value, COALESCE(p.percent_complete, 0) as percent_complete, p.hit_at, p.announced
     FROM weekly_goals g
     LEFT JOIN weekly_goal_progress p ON p.goal_id = g.id
     WHERE g.week_start = $1 ORDER BY g.scope, g.target_id`,
    [weekStart]
  );
  return res.rows;
}

async function findActiveForWeek(weekStart) {
  return findByWeek(weekStart);
}

async function updateProgress(goalId, currentValue, targetValue) {
  const pct = targetValue > 0 ? Math.min(100, (currentValue / targetValue) * 100) : 0;
  const hit = pct >= 100 ? new Date() : null;
  const res = await query(
    `INSERT INTO weekly_goal_progress (goal_id, current_value, percent_complete, hit_at, announced)
     VALUES ($1,$2,$3,$4,false)
     ON CONFLICT (goal_id) DO UPDATE SET
       current_value = EXCLUDED.current_value,
       percent_complete = EXCLUDED.percent_complete,
       hit_at = COALESCE(weekly_goal_progress.hit_at, EXCLUDED.hit_at),
       updated_at = NOW()
     RETURNING *`,
    [goalId, currentValue, pct.toFixed(2), hit]
  );
  return res.rows[0];
}

async function markAnnounced(goalId) {
  await query('UPDATE weekly_goal_progress SET announced = true WHERE goal_id = $1', [goalId]);
}

async function deleteGoal(id) {
  await query('DELETE FROM weekly_goals WHERE id = $1', [id]);
}

module.exports = { create, findByWeek, findActiveForWeek, updateProgress, markAnnounced, deleteGoal };
