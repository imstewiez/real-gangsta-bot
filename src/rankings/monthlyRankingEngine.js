'use strict';
/**
 * Cálculo de rankings mensais + all-time snapshot.
 *
 * Corre normalmente no primeiro dia do mês via scheduler. Também pode ser
 * invocado manualmente via comando.
 *
 * Algoritmo:
 *   1. Determina bounds do mês (start/end)
 *   2. Para cada membro activo: agrega stats daquele mês (material, saídas,
 *      kills, survival, return rate) — MESMA fórmula do ranking semanal mas
 *      janela mensal
 *   3. Calcula hybrid_score
 *   4. Salva em monthly_rankings
 *   5. Recalcula all_time_stats (acumula tudo desde sempre, não a partir
 *      de monthly — evita drift se um mês for recomputado)
 */

const { query } = require('../db');
const { memberRepo, monthlyRankingRepo } = require('../repositories');
const { computeHybridScore } = require('./rankingEngine');
const { log, warn } = require('../logger');

async function _memberMonthStats(memberId, monthStart, monthEnd) {
  const r = await query(
    `
    SELECT
      COUNT(DISTINCT op.operation_id)::int AS saidas,
      SUM(COALESCE(op.kills, 0))::int AS kills,
      SUM(CASE WHEN o.result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
      SUM(CASE WHEN o.result = 'derrota' THEN 1 ELSE 0 END)::int AS losses,
      SUM(CASE WHEN op.died = true THEN 1 ELSE 0 END)::int AS deaths,
      SUM(COALESCE(op.net_material_delta, 0))::numeric AS net_profit,
      AVG(COALESCE(op.discipline_score, 0))::numeric AS avg_discipline,
      AVG(CASE WHEN op.survived = true THEN 100 ELSE 0 END)::numeric AS survival_pct
    FROM operation_participants op
    JOIN operations o ON o.id = op.operation_id
    WHERE op.member_id = $1
      AND o.date >= $2::date AND o.date <= $3::date
      AND o.status = 'concluida'`,
    [memberId, monthStart, monthEnd]
  );
  const row = r.rows[0] || {};
  return {
    saidasCount: Number(row.saidas) || 0,
    killsCount: Number(row.kills) || 0,
    winsCount: Number(row.wins) || 0,
    lossCount: Number(row.losses) || 0,
    netProfit: Number(row.net_profit) || 0,
    returnRate: Number(row.avg_discipline) || 0,
    survivalRate: Number(row.survival_pct) || 0,
  };
}

async function _memberMonthDeliveries(memberId, monthStart, monthEnd) {
  // Material em UNIDADES (coerente com a política do projecto).
  const r = await query(
    `
    SELECT
      SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END)::int AS deliveries,
      SUM(CASE WHEN movement_type = 'venda_bairrista' THEN quantity ELSE 0 END)::int AS sales,
      SUM(CASE WHEN movement_type IN ('entrega_bairrista','venda_bairrista','entrega_oficial')
          THEN quantity ELSE 0 END)::int AS weighted_qty
    FROM inventory_movements
    WHERE member_id = $1 AND created_at >= $2::date AND created_at <= ($3::date + INTERVAL '1 day')`,
    [memberId, monthStart, monthEnd]
  );
  const row = r.rows[0] || {};
  return {
    deliveries: Number(row.deliveries) || 0,
    sales: Number(row.sales) || 0,
    weightedValue: Number(row.weighted_qty) || 0,
  };
}

async function computeMonthlyRankings(ref = new Date()) {
  const { start, end } = monthlyRankingRepo.monthBounds(ref);
  const members = await memberRepo.findAll('ativo');
  const results = [];

  log(`[MONTHLY-RANK] recompute mês ${start}..${end} · ${members.length} membros`);

  for (const member of members) {
    try {
      const deliveries = await _memberMonthDeliveries(member.id, start, end);
      const saidaStats = await _memberMonthStats(member.id, start, end);

      const perfRaw =
        saidaStats.killsCount * 10 +
        saidaStats.winsCount * 20 -
        saidaStats.lossCount * 5 +
        saidaStats.netProfit / 100 +
        saidaStats.saidasCount * 3;

      const hybrid = computeHybridScore({
        weightedValue: deliveries.weightedValue,
        ...saidaStats,
      });

      const saved = await monthlyRankingRepo.saveMonthly({
        memberId: member.id,
        monthStart: start,
        monthEnd: end,
        deliveries: deliveries.deliveries,
        sales: deliveries.sales,
        weightedValue: deliveries.weightedValue,
        operationsCount: saidaStats.saidasCount,
        killsCount: saidaStats.killsCount,
        winsCount: saidaStats.winsCount,
        lossCount: saidaStats.lossCount,
        netProfitGenerated: saidaStats.netProfit,
        returnRate: saidaStats.returnRate,
        survivalRate: saidaStats.survivalRate,
        performanceScore: perfRaw,
        hybridScore: hybrid,
      });
      results.push(saved);
    } catch (e) {
      warn(`[MONTHLY-RANK] falha em ${member.display_name}: ${e.message}`);
    }
  }

  return { monthStart: start, monthEnd: end, count: results.length };
}

async function recomputeAllTimeStats() {
  // Agrega TUDO desde o início — queries cruzadas:
  //   - inventory_movements (entregas, vendas, weighted_value)
  //   - operation_participants (saidas, wins/losses, kills, deaths, mvp, profit)
  const r = await query(`
    WITH inv AS (
      SELECT
        member_id,
        SUM(CASE WHEN movement_type IN ('entrega_bairrista','entrega_oficial') THEN quantity ELSE 0 END)::int AS deliveries,
        SUM(CASE WHEN movement_type = 'venda_bairrista' THEN quantity ELSE 0 END)::int AS sales,
        SUM(CASE WHEN movement_type IN ('entrega_bairrista','venda_bairrista','entrega_oficial')
            THEN quantity ELSE 0 END)::numeric AS weighted_value,
        MIN(created_at::date) AS first_activity,
        MAX(created_at::date) AS last_activity
      FROM inventory_movements
      WHERE member_id IS NOT NULL
      GROUP BY member_id
    ),
    sai AS (
      SELECT
        op.member_id,
        COUNT(DISTINCT op.operation_id)::int AS saidas_total,
        SUM(CASE WHEN o.result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
        SUM(CASE WHEN o.result = 'derrota' THEN 1 ELSE 0 END)::int AS losses,
        SUM(COALESCE(op.kills, 0))::int AS kills_total,
        SUM(CASE WHEN op.died = true THEN 1 ELSE 0 END)::int AS deaths_total,
        SUM(CASE WHEN op.mvp_flag = true THEN 1 ELSE 0 END)::int AS mvp_count,
        SUM(COALESCE(op.net_material_delta, 0))::numeric AS profit_generated,
        AVG(COALESCE(op.discipline_score, 0))::numeric AS avg_discipline,
        MAX(o.date) AS last_saida
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
      WHERE o.status = 'concluida'
      GROUP BY op.member_id
    )
    SELECT
      m.id AS member_id,
      COALESCE(inv.deliveries, 0) AS deliveries,
      COALESCE(inv.sales, 0) AS sales,
      COALESCE(sai.saidas_total, 0) AS saidas_total,
      COALESCE(sai.wins, 0) AS wins,
      COALESCE(sai.losses, 0) AS losses,
      COALESCE(sai.kills_total, 0) AS kills_total,
      COALESCE(sai.deaths_total, 0) AS deaths_total,
      COALESCE(sai.mvp_count, 0) AS mvp_count,
      COALESCE(sai.profit_generated, 0) AS profit_generated,
      COALESCE(inv.weighted_value, 0) AS weighted_value,
      COALESCE(inv.first_activity, m.joined_at::date) AS first_activity,
      GREATEST(inv.last_activity, sai.last_saida) AS last_activity,
      COALESCE(sai.avg_discipline, 0) AS avg_discipline,
      CASE WHEN COALESCE(sai.saidas_total, 0) > 0
        THEN ((COALESCE(sai.saidas_total, 0) - COALESCE(sai.deaths_total, 0))::numeric / sai.saidas_total) * 100
        ELSE 0 END AS survival_rate
    FROM members m
    LEFT JOIN inv ON inv.member_id = m.id
    LEFT JOIN sai ON sai.member_id = m.id
    WHERE m.status = 'ativo' OR m.status IS NULL`);

  for (const row of r.rows) {
    const hybrid = computeHybridScore({
      weightedValue: Number(row.weighted_value) || 0,
      killsCount: Number(row.kills_total) || 0,
      winsCount: Number(row.wins) || 0,
      lossCount: Number(row.losses) || 0,
      netProfit: Number(row.profit_generated) || 0,
      saidasCount: Number(row.saidas_total) || 0,
      returnRate: Number(row.avg_discipline) || 0,
      survivalRate: Number(row.survival_rate) || 0,
    });
    await monthlyRankingRepo.upsertAllTime({
      memberId: row.member_id,
      deliveries: row.deliveries,
      sales: row.sales,
      saidasTotal: row.saidas_total,
      wins: row.wins,
      losses: row.losses,
      killsTotal: row.kills_total,
      deathsTotal: row.deaths_total,
      mvpCount: row.mvp_count,
      profitGenerated: row.profit_generated,
      weightedValue: row.weighted_value,
      hybridScore: hybrid,
      firstActivity: row.first_activity,
      lastActivity: row.last_activity,
    });
  }

  log(`[ALLTIME-RANK] recomputed ${r.rows.length} members`);
  return { count: r.rows.length };
}

module.exports = { computeMonthlyRankings, recomputeAllTimeStats };
