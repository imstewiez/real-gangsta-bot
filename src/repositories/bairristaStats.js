'use strict';
/**
 * Repositório de estatísticas dos Bairristas — material, rankings,
 * progressão, streaks, actividade.
 *
 * Todas as queries partem de `inventory_movements`, `weekly_rankings`,
 * `monthly_rankings`, `all_time_stats` e `member_saida_stats`.
 * Não cria tabelas novas — agrega on-the-fly a partir dos dados existentes.
 *
 * Aceita discord_id directamente para simplificar handlers.
 */
const { query } = require('../db');
const { weekBounds } = require('../util');

// ── Helpers ────────────────────────────────────────────────────────────────

const DELIVERY_TYPES = "'entrega_bairrista','entrega_morador','entrega_oficial'";
const SALE_TYPES = "'venda_bairrista','venda_morador'";
const ALL_CONTRIB_TYPES = `${DELIVERY_TYPES},${SALE_TYPES}`;

async function _memberId(discordId) {
  const r = await query('SELECT id FROM members WHERE discord_id = $1', [discordId]);
  return r.rows[0]?.id || null;
}

// ── Material stats por período ─────────────────────────────────────────────

async function getMaterialStats(discordId, dateFrom, dateTo) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  const r = await query(
    `
    SELECT
      SUM(CASE WHEN movement_type IN (${DELIVERY_TYPES}) THEN quantity ELSE 0 END)::int AS deliveries,
      SUM(CASE WHEN movement_type IN (${SALE_TYPES}) THEN quantity ELSE 0 END)::int AS sales,
      SUM(CASE WHEN movement_type IN (${ALL_CONTRIB_TYPES}) THEN quantity ELSE 0 END)::int AS total_qty,
      SUM(CASE WHEN movement_type IN (${ALL_CONTRIB_TYPES})
          THEN quantity * COALESCE(i.estimated_value, 0) ELSE 0 END)::numeric AS total_value,
      COUNT(DISTINCT im.created_at::date)::int AS active_days
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.member_id = $1
      AND im.created_at >= $2 AND im.created_at < $3
      AND im.movement_type IN (${ALL_CONTRIB_TYPES})
  `,
    [memberId, dateFrom, dateTo]
  );

  const row = r.rows[0] || {};
  return {
    deliveries: Number(row.deliveries) || 0,
    sales: Number(row.sales) || 0,
    totalQty: Number(row.total_qty) || 0,
    totalValue: Number(row.total_value) || 0,
    activeDays: Number(row.active_days) || 0,
  };
}

async function getWeeklyMaterialStats(discordId, weekDate = new Date()) {
  const { start, end } = weekBounds(weekDate);
  const nextDay = new Date(end);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);
  return getMaterialStats(discordId, start.toISOString(), nextDay.toISOString());
}

async function getMonthlyMaterialStats(discordId, refDate = new Date()) {
  const d = new Date(refDate);
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return getMaterialStats(discordId, monthStart.toISOString(), monthEnd.toISOString());
}

async function getAllTimeMaterialStats(discordId) {
  return getMaterialStats(discordId, '2000-01-01', '2100-01-01');
}

// ── Ranking position + vizinhos ────────────────────────────────────────────

async function getRankingPosition(discordId, weekStart) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  const r = await query(
    `
    WITH ranked AS (
      SELECT wr.member_id, m.discord_id, m.display_name, m.tier,
             GREATEST(wr.hybrid_score, wr.weighted_value) AS score,
             ROW_NUMBER() OVER (ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC) AS pos,
             COUNT(*) OVER () AS total
      FROM weekly_rankings wr
      JOIN members m ON m.id = wr.member_id
      WHERE wr.week_start = $1
    )
    SELECT * FROM ranked WHERE member_id = $2
  `,
    [weekStart, memberId]
  );

  if (!r.rows[0]) return null;
  const me = r.rows[0];

  // Vizinhos (quem está acima e abaixo)
  const neighbours = await query(
    `
    WITH ranked AS (
      SELECT wr.member_id, m.discord_id, m.display_name, m.tier,
             GREATEST(wr.hybrid_score, wr.weighted_value) AS score,
             ROW_NUMBER() OVER (ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC) AS pos
      FROM weekly_rankings wr
      JOIN members m ON m.id = wr.member_id
      WHERE wr.week_start = $1
    )
    SELECT * FROM ranked WHERE pos BETWEEN $2 AND $3 ORDER BY pos
  `,
    [weekStart, Math.max(1, Number(me.pos) - 1), Number(me.pos) + 1]
  );

  const above = neighbours.rows.find(n => Number(n.pos) < Number(me.pos)) || null;
  const below = neighbours.rows.find(n => Number(n.pos) > Number(me.pos)) || null;

  return {
    position: Number(me.pos),
    total: Number(me.total),
    score: Number(me.score),
    above: above
      ? {
          displayName: above.display_name,
          discordId: above.discord_id,
          score: Number(above.score),
          position: Number(above.pos),
        }
      : null,
    below: below
      ? {
          displayName: below.display_name,
          discordId: below.discord_id,
          score: Number(below.score),
          position: Number(below.pos),
        }
      : null,
  };
}

async function getMonthlyRankingPosition(discordId, monthStart) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  const r = await query(
    `
    WITH ranked AS (
      SELECT mr.member_id,
             GREATEST(mr.hybrid_score, mr.weighted_value) AS score,
             ROW_NUMBER() OVER (ORDER BY GREATEST(mr.hybrid_score, mr.weighted_value) DESC) AS pos,
             COUNT(*) OVER () AS total
      FROM monthly_rankings mr
      JOIN members m ON m.id = mr.member_id
      WHERE mr.month_start = $1
    )
    SELECT pos, total, score FROM ranked WHERE member_id = $2
  `,
    [monthStart, memberId]
  );

  return r.rows[0]
    ? {
        position: Number(r.rows[0].pos),
        total: Number(r.rows[0].total),
        score: Number(r.rows[0].score),
      }
    : null;
}

async function getAllTimeRankingPosition(discordId) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  const r = await query(
    `
    WITH ranked AS (
      SELECT member_id,
             GREATEST(hybrid_score, weighted_value) AS score,
             ROW_NUMBER() OVER (ORDER BY GREATEST(hybrid_score, weighted_value) DESC) AS pos,
             COUNT(*) OVER () AS total
      FROM all_time_stats
    )
    SELECT pos, total, score FROM ranked WHERE member_id = $1
  `,
    [memberId]
  );

  return r.rows[0]
    ? {
        position: Number(r.rows[0].pos),
        total: Number(r.rows[0].total),
        score: Number(r.rows[0].score),
      }
    : null;
}

// ── Evolução semanal (delta vs semana anterior) ────────────────────────────

async function getWeeklyEvolution(discordId) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  const { start: currStart } = weekBounds();
  const prevWeek = new Date();
  prevWeek.setDate(prevWeek.getDate() - 7);
  const { start: prevStart } = weekBounds(prevWeek);

  const currWeekStart = currStart.toISOString().split('T')[0];
  const prevWeekStart = prevStart.toISOString().split('T')[0];

  // Posição na semana actual vs anterior
  const curr = await getRankingPosition(discordId, currWeekStart);
  const prev = await getRankingPosition(discordId, prevWeekStart);

  return {
    current: curr,
    previous: prev,
    positionDelta: prev && curr ? prev.position - curr.position : null, // positivo = subiu
    scoreDelta: prev && curr ? curr.score - prev.score : null,
  };
}

// ── Streak de contribuição (semanas consecutivas com material) ─────────────

async function getContributionStreak(discordId) {
  const memberId = await _memberId(discordId);
  if (!memberId) return { currentStreak: 0, bestStreak: 0 };

  const r = await query(
    `
    SELECT DISTINCT week_start FROM weekly_rankings
    WHERE member_id = $1
      AND (deliveries > 0 OR sales > 0)
    ORDER BY week_start DESC
  `,
    [memberId]
  );

  if (!r.rows.length) return { currentStreak: 0, bestStreak: 0 };

  const weeks = r.rows.map(row => new Date(row.week_start).getTime());
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Verifica se a semana actual ou a anterior estão incluídas
  const { start: currWeekStart } = weekBounds();
  const currMs = currWeekStart.getTime();
  const prevMs = currMs - WEEK_MS;

  let currentStreak = 0;
  let bestStreak = 0;
  let streak = 0;
  let expected = weeks[0] >= prevMs ? weeks[0] : null;

  if (!expected) return { currentStreak: 0, bestStreak: 0 };

  for (const w of weeks) {
    if (expected && Math.abs(w - expected) < 2 * 24 * 60 * 60 * 1000) {
      streak++;
      expected -= WEEK_MS;
    } else {
      if (currentStreak === 0) currentStreak = streak;
      bestStreak = Math.max(bestStreak, streak);
      streak = 1;
      expected = w - WEEK_MS;
    }
  }
  if (currentStreak === 0) currentStreak = streak;
  bestStreak = Math.max(bestStreak, streak);

  return { currentStreak, bestStreak };
}

// ── Top Bairristas (ranking completo) ──────────────────────────────────────

async function getTopBairristas(weekStart, limit = 10) {
  const r = await query(
    `
    SELECT wr.*, m.discord_id, m.display_name, m.tier, m.role,
           ROW_NUMBER() OVER (ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC) AS pos
    FROM weekly_rankings wr
    JOIN members m ON m.id = wr.member_id
    WHERE wr.week_start = $1 AND m.role = 'bairrista'
    ORDER BY GREATEST(wr.hybrid_score, wr.weighted_value) DESC
    LIMIT $2
  `,
    [weekStart, limit]
  );
  return r.rows;
}

async function getTopBairristasMonthly(monthStart, limit = 10) {
  const r = await query(
    `
    SELECT mr.*, m.discord_id, m.display_name, m.tier, m.role,
           ROW_NUMBER() OVER (ORDER BY GREATEST(mr.hybrid_score, mr.weighted_value) DESC) AS pos
    FROM monthly_rankings mr
    JOIN members m ON m.id = mr.member_id
    WHERE mr.month_start = $1 AND m.role = 'bairrista'
    ORDER BY GREATEST(mr.hybrid_score, mr.weighted_value) DESC
    LIMIT $2
  `,
    [monthStart, limit]
  );
  return r.rows;
}

async function getTopBairristasAllTime(limit = 10) {
  const r = await query(
    `
    SELECT ats.*, m.discord_id, m.display_name, m.tier, m.role,
           ROW_NUMBER() OVER (ORDER BY GREATEST(ats.hybrid_score, ats.weighted_value) DESC) AS pos
    FROM all_time_stats ats
    JOIN members m ON m.id = ats.member_id
    WHERE m.role = 'bairrista'
    ORDER BY GREATEST(ats.hybrid_score, ats.weighted_value) DESC
    LIMIT $1
  `,
    [limit]
  );
  return r.rows;
}

// ── Daily summary (para job de resumo diário) ──────────────────────────────

async function getDailySummary(date = new Date()) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const r = await query(
    `
    SELECT
      m.discord_id, m.display_name,
      SUM(im.quantity)::int AS total_qty,
      SUM(im.quantity * COALESCE(i.estimated_value, 0))::numeric AS total_value,
      SUM(CASE WHEN im.movement_type IN (${DELIVERY_TYPES}) THEN im.quantity ELSE 0 END)::int AS deliveries,
      SUM(CASE WHEN im.movement_type IN (${SALE_TYPES}) THEN im.quantity ELSE 0 END)::int AS sales
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    JOIN items i ON i.id = im.item_id
    WHERE im.created_at >= $1 AND im.created_at <= $2
      AND im.movement_type IN (${ALL_CONTRIB_TYPES})
    GROUP BY m.discord_id, m.display_name
    ORDER BY total_qty DESC
  `,
    [dayStart.toISOString(), dayEnd.toISOString()]
  );

  const totals = r.rows.reduce(
    (acc, row) => {
      acc.totalQty += Number(row.total_qty) || 0;
      acc.totalValue += Number(row.total_value) || 0;
      return acc;
    },
    { totalQty: 0, totalValue: 0 }
  );

  // Material mais entregue no dia
  const topItem = await query(
    `
    SELECT i.name, SUM(im.quantity)::int AS qty
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.created_at >= $1 AND im.created_at <= $2
      AND im.movement_type IN (${ALL_CONTRIB_TYPES})
    GROUP BY i.name
    ORDER BY qty DESC LIMIT 1
  `,
    [dayStart.toISOString(), dayEnd.toISOString()]
  );

  return {
    date: dayStart.toISOString().split('T')[0],
    members: r.rows,
    totalQty: totals.totalQty,
    totalValue: totals.totalValue,
    topItem: topItem.rows[0] || null,
  };
}

// ── Perfil completo ("Movimento no Bairro") ────────────────────────────────

async function getFullProfile(discordId) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  // Buscar membro
  const memberR = await query('SELECT * FROM members WHERE id = $1', [memberId]);
  const member = memberR.rows[0];
  if (!member) return null;

  // Buscar todas as peças em paralelo
  const { start: currWeekStart } = weekBounds();
  const currMonth = new Date();
  const monthStart = new Date(Date.UTC(currMonth.getUTCFullYear(), currMonth.getUTCMonth(), 1))
    .toISOString()
    .split('T')[0];
  const weekStartStr = currWeekStart.toISOString().split('T')[0];

  const [
    weekStats,
    monthStats,
    allTimeStats,
    weekRank,
    monthRank,
    allTimeRank,
    evolution,
    streak,
    saidaStats,
    allTimeRow,
  ] = await Promise.all([
    getWeeklyMaterialStats(discordId),
    getMonthlyMaterialStats(discordId),
    getAllTimeMaterialStats(discordId),
    getRankingPosition(discordId, weekStartStr),
    getMonthlyRankingPosition(discordId, monthStart),
    getAllTimeRankingPosition(discordId),
    getWeeklyEvolution(discordId),
    getContributionStreak(discordId),
    query('SELECT * FROM member_saida_stats WHERE member_id = $1', [memberId]).then(r => r.rows[0] || null),
    query('SELECT * FROM all_time_stats WHERE member_id = $1', [memberId]).then(r => r.rows[0] || null),
  ]);

  return {
    member,
    material: { week: weekStats, month: monthStats, allTime: allTimeStats },
    ranking: { week: weekRank, month: monthRank, allTime: allTimeRank },
    evolution,
    streak,
    saida: saidaStats
      ? {
          total: Number(saidaStats.saidas_total) || 0,
          wins: Number(saidaStats.wins) || 0,
          losses: Number(saidaStats.losses) || 0,
          kills: Number(saidaStats.kills_total) || 0,
          deaths: Number(saidaStats.deaths_total) || 0,
          kdRatio: Number(saidaStats.kd_ratio) || 0,
          survivalRate: Number(saidaStats.survival_rate) || 0,
          mvpCount: Number(saidaStats.mvp_count) || 0,
          materialReturnRate: Number(saidaStats.material_return_rate) || 0,
        }
      : null,
    allTime: allTimeRow
      ? {
          hybridScore: Number(allTimeRow.hybrid_score) || 0,
          deliveries: Number(allTimeRow.deliveries) || 0,
          sales: Number(allTimeRow.sales) || 0,
          weightedValue: Number(allTimeRow.weighted_value) || 0,
        }
      : null,
  };
}

module.exports = {
  getMaterialStats,
  getWeeklyMaterialStats,
  getMonthlyMaterialStats,
  getAllTimeMaterialStats,
  getRankingPosition,
  getMonthlyRankingPosition,
  getAllTimeRankingPosition,
  getWeeklyEvolution,
  getContributionStreak,
  getTopBairristas,
  getTopBairristasMonthly,
  getTopBairristasAllTime,
  getDailySummary,
  getFullProfile,
};
