'use strict';
const { weeklyGoalsRepo, bairristaStatsRepo, rankingRepo } = require('../repositories');
const { log } = require('../logger');

function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { weekStart: monday, weekEnd: sunday };
}

async function createGoal({ scope, targetId, metric, targetValue, description, createdBy }) {
  const { weekStart, weekEnd } = getWeekBounds();
  const goal = await weeklyGoalsRepo.create({
    scope,
    targetId: targetId || '',
    metric,
    targetValue,
    weekStart,
    weekEnd,
    description,
    createdBy,
  });
  log('[WeeklyGoal] Criada meta', goal.id, scope, metric, 'por', createdBy);
  return goal;
}

async function recalculateProgress(weekStart) {
  const goals = await weeklyGoalsRepo.findByWeek(weekStart);
  for (const g of goals) {
    let current = 0;
    if (g.metric === 'deliveries_qty') {
      const stats = await bairristaStatsRepo.getWeeklyContribution(g.target_id || null, weekStart);
      current = stats?.total_deliveries || 0;
    } else if (g.metric === 'sales_qty') {
      const stats = await bairristaStatsRepo.getWeeklyContribution(g.target_id || null, weekStart);
      current = stats?.total_sales || 0;
    } else if (g.metric === 'deliveries_value') {
      const stats = await bairristaStatsRepo.getWeeklyContribution(g.target_id || null, weekStart);
      current = stats?.total_value || 0;
    }
    await weeklyGoalsRepo.updateProgress(g.id, current, g.target_value);
  }
  return goals;
}

async function getGoalsWithProgress(weekStart) {
  return weeklyGoalsRepo.findByWeek(weekStart);
}

module.exports = { getWeekBounds, createGoal, recalculateProgress, getGoalsWithProgress };
