'use strict';
const { query } = require('../db');

async function saveWeeklyRanking({ memberId, weekStart, weekEnd, deliveries, sales, operationsCount, weightedValue, returnRate }) {
  const res = await query(
    `INSERT INTO weekly_rankings (member_id, week_start, week_end, deliveries, sales, operations_count, weighted_value, return_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (member_id, week_start) DO UPDATE SET
       week_end = EXCLUDED.week_end,
       deliveries = EXCLUDED.deliveries,
       sales = EXCLUDED.sales,
       operations_count = EXCLUDED.operations_count,
       weighted_value = EXCLUDED.weighted_value,
       return_rate = EXCLUDED.return_rate
     RETURNING *`,
    [memberId, weekStart, weekEnd, deliveries, sales, operationsCount, weightedValue, returnRate]
  );
  return res.rows[0];
}

async function getWeekRanking(weekStart, limit = 10) {
  const res = await query(`
    SELECT wr.*, m.discord_id, m.display_name, m.role
    FROM weekly_rankings wr
    JOIN members m ON m.id = wr.member_id
    WHERE wr.week_start = $1
    ORDER BY wr.weighted_value DESC
    LIMIT $2
  `, [weekStart, limit]);
  return res.rows;
}

async function getWeekRankingByRole(weekStart, role, limit = 10) {
  const res = await query(`
    SELECT wr.*, m.discord_id, m.display_name, m.role
    FROM weekly_rankings wr
    JOIN members m ON m.id = wr.member_id
    WHERE wr.week_start = $1 AND m.role = $2
    ORDER BY wr.weighted_value DESC
    LIMIT $3
  `, [weekStart, role, limit]);
  return res.rows;
}

async function getMemberHistory(memberId, limit = 12) {
  const res = await query(`
    SELECT * FROM weekly_rankings
    WHERE member_id = $1
    ORDER BY week_start DESC
    LIMIT $2
  `, [memberId, limit]);
  return res.rows;
}

async function getWeekSummary(weekStart) {
  const res = await query(`
    SELECT
      COUNT(*) as total_members,
      SUM(deliveries) as total_deliveries,
      SUM(sales) as total_sales,
      SUM(operations_count) as total_operations,
      SUM(weighted_value) as total_weighted_value,
      AVG(return_rate) as avg_return_rate
    FROM weekly_rankings
    WHERE week_start = $1
  `, [weekStart]);
  return res.rows[0];
}

module.exports = {
  saveWeeklyRanking,
  getWeekRanking,
  getWeekRankingByRole,
  getMemberHistory,
  getWeekSummary,
};
