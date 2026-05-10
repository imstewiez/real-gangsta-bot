'use strict';
/**
 * Repositório de monthly_rankings + all_time_stats.
 *
 * Ambas são projecções recalculadas via job mensal. Nunca source of truth.
 */
const { query } = require('../db');

// ─── Bounds ──────────────────────────────────────────────────────────────────
function monthBounds(ref = new Date()) {
  const d = new Date(ref);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function prevMonthBounds(ref = new Date()) {
  const d = new Date(ref);
  d.setUTCDate(0); // último dia do mês anterior
  return monthBounds(d);
}

// ─── Monthly ────────────────────────────────────────────────────────────────
async function saveMonthly(row) {
  const {
    memberId,
    monthStart,
    monthEnd,
    deliveries = 0,
    sales = 0,
    operationsCount = 0,
    weightedValue = 0,
    returnRate = 0,
    killsCount = 0,
    winsCount = 0,
    lossCount = 0,
    netProfitGenerated = 0,
    survivalRate = 0,
    performanceScore = 0,
    hybridScore = 0,
    normalizedScore = 0,
  } = row;

  const res = await query(
    `INSERT INTO monthly_rankings
       (member_id, month_start, month_end, deliveries, sales,
        operations_count, weighted_value, return_rate,
        kills_count, wins_count, loss_count,
        net_profit_generated, survival_rate,
        performance_score, hybrid_score, normalized_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (member_id, month_start) DO UPDATE SET
       month_end            = EXCLUDED.month_end,
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
       hybrid_score         = EXCLUDED.hybrid_score,
       normalized_score     = EXCLUDED.normalized_score,
       updated_at           = NOW()
     RETURNING *`,
    [
      memberId,
      monthStart,
      monthEnd,
      deliveries,
      sales,
      operationsCount,
      weightedValue,
      returnRate,
      killsCount,
      winsCount,
      lossCount,
      netProfitGenerated,
      survivalRate,
      performanceScore,
      hybridScore,
      normalizedScore,
    ]
  );
  return res.rows[0];
}

async function getMonthly(monthStart, limit = 50) {
  const res = await query(
    `
    SELECT mr.*, m.discord_id, m.display_name, m.role, m.tier
    FROM monthly_rankings mr
    JOIN members m ON m.id = mr.member_id
    WHERE mr.month_start = $1
    ORDER BY COALESCE(mr.normalized_score, mr.hybrid_score, mr.weighted_value) DESC
    LIMIT $2`,
    [monthStart, limit]
  );
  return res.rows;
}

async function getMemberMonths(memberId, limit = 12) {
  const res = await query(
    `
    SELECT * FROM monthly_rankings WHERE member_id = $1
    ORDER BY month_start DESC LIMIT $2`,
    [memberId, limit]
  );
  return res.rows;
}

// ─── All-time snapshot ──────────────────────────────────────────────────────
async function upsertAllTime(row) {
  const {
    memberId,
    deliveries = 0,
    sales = 0,
    saidasTotal = 0,
    wins = 0,
    losses = 0,
    killsTotal = 0,
    deathsTotal = 0,
    mvpCount = 0,
    profitGenerated = 0,
    weightedValue = 0,
    hybridScore = 0,
    firstActivity = null,
    lastActivity = null,
  } = row;

  const res = await query(
    `INSERT INTO all_time_stats
       (member_id, deliveries, sales, saidas_total, wins, losses,
        kills_total, deaths_total, mvp_count, profit_generated,
        weighted_value, hybrid_score, first_activity, last_activity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (member_id) DO UPDATE SET
       deliveries       = EXCLUDED.deliveries,
       sales            = EXCLUDED.sales,
       saidas_total     = EXCLUDED.saidas_total,
       wins             = EXCLUDED.wins,
       losses           = EXCLUDED.losses,
       kills_total      = EXCLUDED.kills_total,
       deaths_total     = EXCLUDED.deaths_total,
       mvp_count        = EXCLUDED.mvp_count,
       profit_generated = EXCLUDED.profit_generated,
       weighted_value   = EXCLUDED.weighted_value,
       hybrid_score     = EXCLUDED.hybrid_score,
       first_activity   = COALESCE(EXCLUDED.first_activity, all_time_stats.first_activity),
       last_activity    = GREATEST(EXCLUDED.last_activity, all_time_stats.last_activity),
       updated_at       = NOW()
     RETURNING *`,
    [
      memberId,
      deliveries,
      sales,
      saidasTotal,
      wins,
      losses,
      killsTotal,
      deathsTotal,
      mvpCount,
      profitGenerated,
      weightedValue,
      hybridScore,
      firstActivity,
      lastActivity,
    ]
  );
  return res.rows[0];
}

async function getAllTimeTop(orderBy = 'hybrid_score', limit = 25) {
  const valid = new Set([
    'hybrid_score',
    'kills_total',
    'weighted_value',
    'profit_generated',
    'mvp_count',
    'saidas_total',
  ]);
  const col = valid.has(orderBy) ? orderBy : 'hybrid_score';
  const res = await query(
    `
    SELECT ats.*, m.discord_id, m.display_name, m.role, m.tier
    FROM all_time_stats ats
    JOIN members m ON m.id = ats.member_id
    ORDER BY ats.${col} DESC NULLS LAST
    LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function getAllTimeByMember(memberId) {
  const res = await query('SELECT * FROM all_time_stats WHERE member_id = $1', [memberId]);
  return res.rows[0] || null;
}

module.exports = {
  monthBounds,
  prevMonthBounds,
  saveMonthly,
  getMonthly,
  getMemberMonths,
  upsertAllTime,
  getAllTimeTop,
  getAllTimeByMember,
};
