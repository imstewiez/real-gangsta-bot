'use strict';
const { query } = require('../db');

async function saveWeeklyRanking(row) {
  const {
    memberId,
    weekStart,
    weekEnd,
    deliveries = 0,
    sales = 0,
    operationsCount = 0,
    saidasCount = operationsCount, // compat
    weightedValue = 0,
    returnRate = 0,
    killsCount = 0,
    winsCount = 0,
    lossCount = 0,
    netProfitGenerated = 0,
    survivalRate = 0,
    performanceScore = 0,
    hybridScore = 0,
  } = row;

  const res = await query(
    `INSERT INTO weekly_rankings
       (member_id, week_start, week_end, deliveries, sales,
        operations_count, weighted_value, return_rate,
        kills_count, wins_count, loss_count,
        net_profit_generated, survival_rate,
        performance_score, hybrid_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (member_id, week_start) DO UPDATE SET
       week_end             = EXCLUDED.week_end,
       deliveries           = EXCLUDED.deliveries,
       sales                = EXCLUDED.sales,
       operations_count     = EXCLUDED.operations_count,
       weighted_value       = EXCLUDED.weighted_value,
       return_rate          = EXCLUDED.return_rate,
       kills_count          = EXCLUDED.kills_count,
       wins_count           = EXCLUDED.wins_count,
       loss_count           = EXCLUDED.loss_count,
       net_profit_generated = EXCLUDED.net_profit_generated,
       survival_rate        = EXCLUDED.survival_rate,
       performance_score    = EXCLUDED.performance_score,
       hybrid_score         = EXCLUDED.hybrid_score
     RETURNING *`,
    [
      memberId,
      weekStart,
      weekEnd,
      deliveries,
      sales,
      saidasCount,
      weightedValue,
      returnRate,
      killsCount,
      winsCount,
      lossCount,
      netProfitGenerated,
      survivalRate,
      performanceScore,
      hybridScore,
    ]
  );
  return res.rows[0];
}

async function getWeekRanking(weekStart, limit = 10) {
  // Ordena por hybrid_score (desc). Fallback para weighted_value se hybrid=0.
  const res = await query(
    `
    SELECT wr.*, m.discord_id, m.display_name, m.role
    FROM weekly_rankings wr
    JOIN members m ON m.id = wr.member_id
    WHERE wr.week_start = $1
    ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC
    LIMIT $2
  `,
    [weekStart, limit]
  );
  return res.rows;
}

async function getWeekRankingByRole(weekStart, role, limit = 10) {
  const res = await query(
    `
    SELECT wr.*, m.discord_id, m.display_name, m.role
    FROM weekly_rankings wr
    JOIN members m ON m.id = wr.member_id
    WHERE wr.week_start = $1 AND m.role = $2
    ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC
    LIMIT $3
  `,
    [weekStart, role, limit]
  );
  return res.rows;
}

async function getMemberHistory(memberId, limit = 12) {
  const res = await query(
    `
    SELECT * FROM weekly_rankings
    WHERE member_id = $1
    ORDER BY week_start DESC
    LIMIT $2
  `,
    [memberId, limit]
  );
  return res.rows;
}

async function getWeekSummary(weekStart) {
  const res = await query(
    `
    SELECT
      COUNT(*) as total_members,
      SUM(deliveries) as total_deliveries,
      SUM(sales) as total_sales,
      SUM(operations_count) as total_saidas,
      SUM(kills_count) as total_kills,
      SUM(wins_count) as total_wins,
      SUM(loss_count) as total_losses,
      SUM(weighted_value) as total_weighted_value,
      SUM(net_profit_generated) as total_net_profit,
      AVG(return_rate) as avg_return_rate,
      AVG(survival_rate) as avg_survival_rate
    FROM weekly_rankings
    WHERE week_start = $1
  `,
    [weekStart]
  );
  return res.rows[0];
}

module.exports = {
  saveWeeklyRanking,
  getWeekRanking,
  getWeekRankingByRole,
  getMemberHistory,
  getWeekSummary,
};
