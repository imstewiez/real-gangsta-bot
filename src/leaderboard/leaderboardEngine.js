'use strict';
/**
 * Leaderboard engine — agregações de top 1 por (período, categoria).
 *
 * Categorias e definições:
 *   • **activity**         = saídas participadas + submissions de inventário +
 *                            kills, somados por membro no período.
 *   • **mvp**              = COUNT(operation_participants.mvp_flag=true) no
 *                            período; empate → mais kills.
 *   • **kda**              = SUM(kills) / MAX(SUM(deaths), 1) no período;
 *                            só conta membros com ≥ 2 saídas (evita ratio
 *                            instável tipo "1 saída, 1 kill, 0 deaths = Infinity").
 *   • **material_delivered** = SUM(quantity) onde movement_type IN
 *                              ('entrega_bairrista','entrega_oficial').
 *   • **material_sold**    = SUM(quantity) onde movement_type =
 *                            'venda_bairrista'. Valor em €:
 *                            SUM(qty * COALESCE(unit_price, estimated_value)).
 *
 * Períodos (timezone local, alinhado com weekBounds existente):
 *   • **daily**   = hoje, 00:00 → 23:59:59.999
 *   • **weekly**  = semana ISO actual (Seg → Dom)
 *   • **monthly** = mês corrente (dia 1 UTC → próximo mês 1 UTC)
 *
 * Todas as queries projectam directamente das tabelas fonte — zero
 * storage novo para leaderboard. 5 queries × 3 períodos = ~15 queries
 * por refresh, aceitável para panel 5-min.
 */

const { query } = require('../db');
const { weekBounds } = require('../util');
const { sqlIn, DELIVERY_TYPES, SALE_TYPES, CONTRIBUTION_TYPES } = require('../shared/movementTypes');

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD BOUNDS
// ═══════════════════════════════════════════════════════════════════════════

function dayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function monthBounds(date = new Date()) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0);
  end.setMilliseconds(-1);
  return { start, end };
}

/**
 * Devolve { start, end, label, nextAt } para um período.
 *
 * @param {'daily'|'weekly'|'monthly'} period
 */
function periodBounds(period, refDate = new Date()) {
  if (period === 'daily') {
    const { start, end } = dayBounds(refDate);
    const label = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'long' }).format(start);
    return { start, end, label };
  }
  if (period === 'weekly') {
    const { start, end } = weekBounds(refDate);
    const label = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')} – ${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`;
    return { start, end, label };
  }
  if (period === 'monthly') {
    const { start, end } = monthBounds(refDate);
    const label = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(start);
    return { start, end, label };
  }
  throw new Error(`Unknown period: ${period}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP QUERIES — per category, per period
// Cada função devolve { top: [...], leader: top[0] } com top 5 para usar no
// details view. Empty → { top: [], leader: null }.
// ═══════════════════════════════════════════════════════════════════════════

async function getActivityLeaders(start, end, limit = 5) {
  // Activity composta: saídas + submissions + kills.
  // Usa JOIN outer para apanhar membros activos em qualquer das 3 fontes.
  const r = await query(
    `
    WITH inv AS (
      SELECT im.member_id,
             COUNT(DISTINCT COALESCE(im.submission_id::text, 'single-' || im.id::text)) AS submissions
        FROM inventory_movements im
       WHERE im.member_id IS NOT NULL
         AND im.created_at::date >= $1::date AND im.created_at::date <= $2::date
         AND im.movement_type IN (${sqlIn(CONTRIBUTION_TYPES)})
       GROUP BY im.member_id
    ),
    sai AS (
      SELECT op.member_id,
             COUNT(DISTINCT op.operation_id) AS saidas,
             SUM(COALESCE(op.kills, 0))::int AS kills
        FROM operation_participants op
        JOIN operations o ON o.id = op.operation_id
       WHERE o.date >= $1::date AND o.date <= $2::date
         AND o.status IN ('em_liquidacao','concluida')
       GROUP BY op.member_id
    )
    SELECT m.discord_id, m.display_name,
           COALESCE(inv.submissions, 0)::int AS submissions,
           COALESCE(sai.saidas, 0)::int AS saidas,
           COALESCE(sai.kills, 0)::int AS kills,
           (COALESCE(inv.submissions, 0) + COALESCE(sai.saidas, 0) + COALESCE(sai.kills, 0))::int AS score
      FROM members m
      LEFT JOIN inv ON inv.member_id = m.id
      LEFT JOIN sai ON sai.member_id = m.id
     WHERE (COALESCE(inv.submissions, 0) + COALESCE(sai.saidas, 0) + COALESCE(sai.kills, 0)) > 0
     ORDER BY score DESC, saidas DESC, m.display_name ASC
     LIMIT $3
  `,
    [start, end, limit]
  );
  const top = r.rows.map(row => ({
    discordId: row.discord_id,
    displayName: row.display_name,
    score: Number(row.score),
    submissions: Number(row.submissions),
    saidas: Number(row.saidas),
    kills: Number(row.kills),
  }));
  return { top, leader: top[0] || null };
}

async function getMvpLeaders(start, end, limit = 5) {
  // MVP = COUNT(mvp_flag=true) no período. Empate → mais kills desempata.
  const r = await query(
    `
    SELECT m.discord_id, m.display_name,
           COUNT(*)::int AS mvp_count,
           SUM(COALESCE(op.kills, 0))::int AS kills_in_mvp
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
      JOIN members m ON m.id = op.member_id
     WHERE op.mvp_flag = TRUE
       AND o.status = 'concluida'
       AND o.date >= $1::date AND o.date <= $2::date
     GROUP BY m.id, m.discord_id, m.display_name
     ORDER BY mvp_count DESC, kills_in_mvp DESC, m.display_name ASC
     LIMIT $3
  `,
    [start, end, limit]
  );
  const top = r.rows.map(row => ({
    discordId: row.discord_id,
    displayName: row.display_name,
    mvpCount: Number(row.mvp_count),
    killsInMvp: Number(row.kills_in_mvp),
    score: Number(row.mvp_count),
  }));
  return { top, leader: top[0] || null };
}

async function getKdaLeaders(start, end, limit = 5) {
  // KDA per período, HAVING saidas >= 2 para evitar ratio instável.
  // Empate → mais kills.
  const r = await query(
    `
    SELECT m.discord_id, m.display_name,
           COUNT(DISTINCT op.operation_id)::int AS saidas,
           SUM(COALESCE(op.kills, 0))::int AS kills,
           SUM(CASE WHEN op.died THEN 1 ELSE 0 END)::int AS deaths,
           ROUND(
             (SUM(COALESCE(op.kills, 0))::numeric /
              GREATEST(SUM(CASE WHEN op.died THEN 1 ELSE 0 END), 1)),
             2
           )::float AS kda
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
      JOIN members m ON m.id = op.member_id
     WHERE o.status = 'concluida'
       AND o.date >= $1::date AND o.date <= $2::date
     GROUP BY m.id, m.discord_id, m.display_name
    HAVING COUNT(DISTINCT op.operation_id) >= 2
       AND SUM(COALESCE(op.kills, 0)) > 0
     ORDER BY kda DESC, kills DESC, m.display_name ASC
     LIMIT $3
  `,
    [start, end, limit]
  );
  const top = r.rows.map(row => ({
    discordId: row.discord_id,
    displayName: row.display_name,
    kills: Number(row.kills),
    deaths: Number(row.deaths),
    saidas: Number(row.saidas),
    kda: Number(row.kda),
    score: Number(row.kda),
  }));
  return { top, leader: top[0] || null };
}

async function getMaterialDeliveredLeaders(start, end, limit = 5) {
  const r = await query(
    `
    SELECT m.discord_id, m.display_name,
           SUM(im.quantity)::int AS total_qty,
           COUNT(DISTINCT COALESCE(im.submission_id::text, 's-' || im.id::text))::int AS submissions,
           SUM(im.quantity * COALESCE(im.unit_price, i.estimated_value, 0))::numeric AS total_value
      FROM inventory_movements im
      JOIN members m ON m.id = im.member_id
      JOIN items i ON i.id = im.item_id
     WHERE im.movement_type IN (${sqlIn(DELIVERY_TYPES)})
       AND im.created_at >= $1 AND im.created_at <= $2
     GROUP BY m.id, m.discord_id, m.display_name
    HAVING SUM(im.quantity) > 0
     ORDER BY total_qty DESC, m.display_name ASC
     LIMIT $3
  `,
    [start, end, limit]
  );
  const top = r.rows.map(row => ({
    discordId: row.discord_id,
    displayName: row.display_name,
    totalQty: Number(row.total_qty),
    submissions: Number(row.submissions),
    totalValue: Number(row.total_value) || 0,
    score: Number(row.total_qty),
  }));
  return { top, leader: top[0] || null };
}

async function getMaterialSoldLeaders(start, end, limit = 5) {
  const r = await query(
    `
    SELECT m.discord_id, m.display_name,
           SUM(im.quantity)::int AS total_qty,
           COUNT(DISTINCT COALESCE(im.submission_id::text, 's-' || im.id::text))::int AS submissions,
           SUM(im.quantity * COALESCE(im.unit_price, i.estimated_value, 0))::numeric AS total_value
      FROM inventory_movements im
      JOIN members m ON m.id = im.member_id
      JOIN items i ON i.id = im.item_id
     WHERE im.movement_type IN (${sqlIn(SALE_TYPES)})
       AND im.created_at >= $1 AND im.created_at <= $2
     GROUP BY m.id, m.discord_id, m.display_name
    HAVING SUM(im.quantity) > 0
     ORDER BY total_value DESC, total_qty DESC, m.display_name ASC
     LIMIT $3
  `,
    [start, end, limit]
  );
  const top = r.rows.map(row => ({
    discordId: row.discord_id,
    displayName: row.display_name,
    totalQty: Number(row.total_qty),
    submissions: Number(row.submissions),
    totalValue: Number(row.total_value) || 0,
    score: Number(row.total_value) || 0,
  }));
  return { top, leader: top[0] || null };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITION — all leaders para todos os períodos
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Para um período, devolve { category: { top, leader } } para todas as
 * 5 categorias. Queries correm em paralelo.
 */
async function getPeriodLeaders(period, refDate = new Date()) {
  const { start, end, label } = periodBounds(period, refDate);
  const [activity, mvp, kda, delivered, sold] = await Promise.all([
    getActivityLeaders(start, end, 5),
    getMvpLeaders(start, end, 5),
    getKdaLeaders(start, end, 5),
    getMaterialDeliveredLeaders(start, end, 5),
    getMaterialSoldLeaders(start, end, 5),
  ]);
  return {
    period,
    label,
    start,
    end,
    categories: { activity, mvp, kda, delivered, sold },
  };
}

/**
 * Compõe os 3 períodos. Usado pelo publisher do embed principal.
 */
async function getAllPeriodsLeaders() {
  const [daily, weekly, monthly] = await Promise.all([
    getPeriodLeaders('daily'),
    getPeriodLeaders('weekly'),
    getPeriodLeaders('monthly'),
  ]);
  return { daily, weekly, monthly };
}

/**
 * Calcula refDate para navegação: avança/recua N unidades do período.
 * @param {'daily'|'weekly'|'monthly'} period
 * @param {number} offset  (-1 = anterior, +1 = seguinte)
 * @param {Date} baseDate
 */
function navigatePeriod(period, offset, baseDate = new Date()) {
  const d = new Date(baseDate);
  if (period === 'daily') {
    d.setDate(d.getDate() + offset);
  } else if (period === 'weekly') {
    d.setDate(d.getDate() + offset * 7);
  } else if (period === 'monthly') {
    d.setMonth(d.getMonth() + offset);
  }
  return d;
}

module.exports = {
  // period helpers
  dayBounds,
  monthBounds,
  periodBounds,
  navigatePeriod,
  // individual categories (exposed for testing/debug)
  getActivityLeaders,
  getMvpLeaders,
  getKdaLeaders,
  getMaterialDeliveredLeaders,
  getMaterialSoldLeaders,
  // composition
  getPeriodLeaders,
  getAllPeriodsLeaders,
};
